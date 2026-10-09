// Consensus of several OCR passes over the SAME photo.
// The passes disagree about which words they could read. The pass whose text looks most like real ingredient names becomes the BASE;
// better readings of the same ingredient from other passes replace its weaker ones, and ingredients the base missed are added where they
// belong. The text kept is always OCR'd raw text, never the dictionary's spelling: an ingredient is only ever corrected later, in the
// review panel, when the user accepts a suggestion. The name list only judges how name-like a reading is.
import { similarity, type MSegment } from "./merge";
import { nearest, type Lexicon } from "./lexicon";

export interface PassIn { id: string; segments: MSegment[] }
export interface ConsensusItem { seg: MSegment; votes: number; looksLike: string | null; sim: number; passes: string[]; from: "base" | "better" | "added" }
export interface ConsensusResult { items: ConsensusItem[]; dropped: number; passes: number; base: string }
export const NAME_SIM = 0.68;       // a reading "looks like" a known name at or above this similarity
export const RAW_SIM = 0.75;        // two readings with no known name are "the same text" at or above this
const BETTER_BY = 0.08;             // another pass's reading replaces the base's only if it is this much closer to a known name

interface Read { seg: MSegment; sim: number; name: string | null; pass: string; idx: number }
interface Cl { key: string; byName: boolean; reads: Read[] }

const JUNK_CONF = 55;   // leading words below this confidence that look like no ingredient name are camera junk (a header, a half-cut line)

/** Drops leading low-confidence words that look like no known name, but only when what is left reads clearly better. Never drops a confident word. */
export function trimJunkPrefix(seg: MSegment, lex: Lexicon): MSegment {
  let k = 0;
  while (k < Math.min(8, seg.words.length - 1) && seg.words[k].confidence < JUNK_CONF && !(nearest(lex, seg.words[k].text, 0.6))) k++;
  if (k === 0) return seg;
  const rest = seg.words.slice(k), text = rest.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
  const before = nearest(lex, seg.text, 0.55)?.sim ?? 0, after = nearest(lex, text, 0.55)?.sim ?? 0;
  if (after < 0.8 || after <= before) return seg;
  return { ...seg, text, words: rest, conf: rest.reduce((a, w) => a + w.confidence, 0) / rest.length };
}

export function consensus(rawPasses: PassIn[], lex: Lexicon): ConsensusResult {
  const passes = rawPasses.map((p) => ({ id: p.id, segments: p.segments.map((s) => trimJunkPrefix(s, lex)) }));
  const cache = new Map<string, ReturnType<typeof nearest>>();
  const near = (t: string) => { let r = cache.get(t); if (r === undefined) { r = nearest(lex, t, 0.55); cache.set(t, r); } return r; };
  const clusters: Cl[] = [];
  for (const p of passes) {
    const used = new Set<Cl>();
    p.segments.forEach((s, idx) => {
      const nn = near(s.text), name = nn && nn.sim >= NAME_SIM ? nn.name : null;
      let cl: Cl | undefined;
      if (name) cl = clusters.find((c) => c.byName && c.key === name && !used.has(c));
      else cl = clusters.find((c) => !c.byName && !used.has(c) && similarity(c.reads[0].seg.text, s.text) >= RAW_SIM);
      if (!cl) { cl = { key: name ?? s.text, byName: !!name, reads: [] }; clusters.push(cl); }
      used.add(cl); cl.reads.push({ seg: s, sim: nn?.sim ?? 0, name, pass: p.id, idx });
    });
  }
  const votes = (c: Cl) => new Set(c.reads.map((r) => r.pass)).size;
  // base pass: the one with the most distinct known-name clusters (ties: higher mean confidence)
  const score = (p: PassIn) => {
    const mine = clusters.filter((c) => c.byName && c.reads.some((r) => r.pass === p.id)).length;
    const conf = p.segments.length ? p.segments.reduce((a, s) => a + s.conf, 0) / p.segments.length : 0;
    return mine * 1000 + conf;
  };
  const base = [...passes].sort((a, b) => score(b) - score(a))[0];
  const readInBase = (c: Cl) => c.reads.find((r) => r.pass === base.id);
  const out: { item: ConsensusItem; pos: number }[] = [];
  let dropped = 0;
  base.segments.forEach((s, i) => {
    const cl = clusters.find((c) => c.reads.some((r) => r.pass === base.id && r.idx === i))!;
    const mine = readInBase(cl) && cl.reads.find((r) => r.pass === base.id && r.idx === i)!;
    const best = [...cl.reads].sort((a, b) => b.sim - a.sim || b.seg.conf - a.seg.conf)[0];
    const keep = (mine!.sim >= NAME_SIM) || votes(cl) >= 3 || (votes(cl) >= 2 && mine!.seg.conf >= 55);
    if (!keep) { dropped++; return; }
    const better = best !== mine && best.sim >= mine!.sim + BETTER_BY ? best : null;
    const rep = better ?? mine!;
    out.push({ item: { seg: { ...rep.seg, sources: [...new Set(cl.reads.map((r) => r.pass))], conflict: !!better }, votes: votes(cl), looksLike: rep.name, sim: rep.sim, passes: [...new Set(cl.reads.map((r) => r.pass))], from: better ? "better" : "base" },
      pos: base.segments.length > 1 ? i / (base.segments.length - 1) : 0.5 });
  });
  // ingredients the base did not read at all: add them where the other passes saw them (known names only, or seen by 3+ passes)
  const have = new Set(out.map((o) => o.item.looksLike).filter(Boolean));
  for (const cl of clusters) {
    if (readInBase(cl) || !(cl.byName || votes(cl) >= 3)) continue;
    if (cl.byName && have.has(cl.key)) continue;
    const best = [...cl.reads].sort((a, b) => b.sim - a.sim || b.seg.conf - a.seg.conf)[0];
    const poss = cl.reads.map((r) => { const p = passes.find((x) => x.id === r.pass)!; return p.segments.length > 1 ? r.idx / (p.segments.length - 1) : 0.5; });
    out.push({ item: { seg: { ...best.seg, sources: [...new Set(cl.reads.map((r) => r.pass))], conflict: false }, votes: votes(cl), looksLike: best.name, sim: best.sim, passes: [...new Set(cl.reads.map((r) => r.pass))], from: "added" },
      pos: poss.reduce((a, b) => a + b, 0) / poss.length });
    if (cl.byName) have.add(cl.key);
  }
  out.sort((a, b) => a.pos - b.pos);
  // one reading per known name: if two kept items look like the same name, keep the closer one
  const bestFor = new Map<string, ConsensusItem>();
  for (const o of out) { const n = o.item.looksLike; if (!n) continue; const cur = bestFor.get(n); if (!cur || o.item.sim > cur.sim || (o.item.sim === cur.sim && o.item.votes > cur.votes)) bestFor.set(n, o.item); }
  const deduped = out.filter((o) => !o.item.looksLike || bestFor.get(o.item.looksLike) === o.item);
  // a short unnamed fragment that sits inside a longer kept reading is a leftover of a line break: drop it
  const norm = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const final = deduped.filter((o) => o.item.looksLike || !deduped.some((q) => q !== o && norm(q.item.seg.text).length > norm(o.item.seg.text).length && norm(q.item.seg.text).includes(norm(o.item.seg.text))));
  // near-duplicate readings of the same ingredient that no known name could join (similar text, or one inside the other): keep the best
  const better = (a: ConsensusItem, b: ConsensusItem) => a.sim - b.sim || a.votes - b.votes || a.seg.conf - b.seg.conf;
  const alive = final.map(() => true);
  for (let i = 0; i < final.length; i++) for (let j = i + 1; j < final.length; j++) {
    if (!alive[i] || !alive[j]) continue;
    const a = final[i].item, b = final[j].item, na = norm(a.seg.text), nb = norm(b.seg.text);
    const sim = similarity(a.seg.text, b.seg.text), differentNames = !!(a.looksLike && b.looksLike && a.looksLike !== b.looksLike);
    const near = sim >= 0.85 || (!differentNames && sim >= 0.72) || (!differentNames && Math.min(na.length, nb.length) >= 6 && (na.includes(nb) || nb.includes(na)));
    if (near) { if (better(a, b) >= 0) alive[j] = false; else alive[i] = false; }
  }
  const result = final.filter((_, i) => alive[i]);
  return { items: result.map((o) => o.item), dropped: dropped + (out.length - result.length), passes: passes.length, base: base.id };
}
