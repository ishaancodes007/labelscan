// Nearest-name lookup over the ingredient name list, used to judge which OCR readings look like real ingredient names.
// Retrieval by shared character trigrams, then a bounded edit-distance similarity. Names only: no identity decisions are made here.
const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export interface Lexicon { names: string[]; keys: string[]; grams: Map<string, number[]> }
export function buildLexicon(names: string[]): Lexicon {
  const keys = names.map(key), grams = new Map<string, number[]>();
  keys.forEach((k, i) => { const seen = new Set<string>(); for (let j = 0; j + 3 <= k.length; j++) { const g = k.slice(j, j + 3); if (!seen.has(g)) { seen.add(g); const l = grams.get(g); if (l) l.push(i); else grams.set(g, [i]); } } });
  return { names, keys, grams };
}

function boundedSim(a: string, b: string, minSim: number): number {
  const m = a.length, n = b.length, max = Math.max(m, n);
  const maxD = Math.floor((1 - minSim) * max);
  if (Math.abs(m - n) > maxD) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= n; j++) { const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); cur[j] = v; if (v < rowMin) rowMin = v; }
    if (rowMin > maxD) return 0;
    prev = cur;
  }
  return Math.max(0, 1 - prev[n] / max);
}

export interface Near { name: string; sim: number }
export function nearest(lex: Lexicon, text: string, minSim = 0.6): Near | null {
  const k = key(text);
  if (k.length < 4) return null;
  const counts = new Map<number, number>(), seen = new Set<string>();
  let total = 0;
  for (let j = 0; j + 3 <= k.length; j++) { const g = k.slice(j, j + 3); if (seen.has(g)) continue; seen.add(g); total++; for (const i of lex.grams.get(g) ?? []) counts.set(i, (counts.get(i) ?? 0) + 1); }
  const need = Math.max(2, Math.floor(total * 0.35));
  let best: Near | null = null;
  for (const [i, c] of counts) {
    if (c < need) continue;
    const s = boundedSim(k, lex.keys[i], best ? Math.max(minSim, best.sim) : minSim);
    if (s > 0 && (!best || s > best.sim)) best = { name: lex.names[i], sim: s };
  }
  return best;
}
