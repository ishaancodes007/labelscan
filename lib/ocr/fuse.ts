// Consensus of several OCR passes over the SAME photo (different scales / curvature corrections).
// Unlike lib/ocr/merge.ts (different photos that partly overlap), here every pass covers the whole list, so segments are clustered by
// similarity, the best-read variant represents each cluster, and clusters are ordered by where they sat in their passes.
// Nothing here knows ingredient names: it only trusts agreement between passes and per-word OCR confidence.
import { similarity, type MSegment } from "./merge";

export interface FuseOptions { minSim?: number; dropBelowConf?: number; minVotesForLowConf?: number }
export interface Cluster { rep: MSegment; votes: number; pos: number; members: MSegment[] }
export interface FuseResult { segments: MSegment[]; clusters: Cluster[]; passes: number; dropped: number }

const quality = (s: MSegment) => s.conf * Math.min(1, s.text.replace(/[^A-Za-z]/g, "").length / 6);   // short fragments cannot win on confidence alone

export function fusePasses(passes: MSegment[][], opt: FuseOptions = {}): FuseResult {
  const minSim = opt.minSim ?? 0.7, lowConf = opt.dropBelowConf ?? 45, lowVotes = opt.minVotesForLowConf ?? 2;
  const clusters: Cluster[] = [];
  passes.forEach((segs) => {
    const used = new Set<Cluster>();
    segs.forEach((s, i) => {
      const pos = segs.length > 1 ? i / (segs.length - 1) : 0.5;
      let best: Cluster | null = null, bs = 0;
      for (const c of clusters) { if (used.has(c)) continue; const sim = similarity(c.rep.text, s.text); if (sim > bs) { bs = sim; best = c; } }
      if (best && bs >= minSim) {
        used.add(best); best.members.push(s); best.votes++; best.pos = (best.pos * (best.votes - 1) + pos) / best.votes;
        if (quality(s) > quality(best.rep)) best.rep = s;
      } else { const c = { rep: s, votes: 1, pos, members: [s] }; clusters.push(c); used.add(c); }
    });
  });
  const kept = clusters.filter((c) => c.rep.conf >= lowConf || c.votes >= lowVotes);
  kept.sort((a, b) => a.pos - b.pos);
  return {
    segments: kept.map((c) => ({ ...c.rep, sources: [...new Set(c.members.flatMap((m) => m.sources))], conflict: new Set(c.members.map((m) => m.text)).size > 1 })),
    clusters: kept, passes: passes.length, dropped: clusters.length - kept.length,
  };
}
