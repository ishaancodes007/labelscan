// Dupe finder and product-level alternatives. Similarity here is over IDENTIFIED ingredients and notable-active classes only:
// per-ingredient function data (CosIng) is not loaded, so this is not a "function profile". Order is never read as concentration.
import { normKey } from "@/lib/rules/data";
import { activesIn } from "./actives";

export interface Comparable { name: string; ingredients: string[]; unresolved: number }
import type { SavedProduct } from "./types";
export const toComparable = (p: SavedProduct): Comparable => ({ name: p.name, ingredients: p.ingredients, unresolved: p.unresolved.length });
export interface Comparison {
  similarity: number;               // Jaccard over identified ingredient names, 0..1
  shared: string[]; onlyA: string[]; onlyB: string[];
  activesA: string[]; activesB: string[]; sharedActives: string[]; onlyActivesA: string[]; onlyActivesB: string[];
  reliability: "ok" | "low";        // low when many printed items are still unconfirmed
}
const keyed = (l: string[]) => new Map(l.map((n) => [normKey(n), n]));

export function compare(a: Comparable, b: Comparable): Comparison {
  const A = keyed(a.ingredients), B = keyed(b.ingredients);
  const shared = [...A.keys()].filter((k) => B.has(k)), union = new Set([...A.keys(), ...B.keys()]);
  const actA = activesIn(a.ingredients).map((x) => x.inci), actB = activesIn(b.ingredients).map((x) => x.inci);
  const kA = new Set(actA.map(normKey)), kB = new Set(actB.map(normKey));
  const totalA = a.ingredients.length + a.unresolved, totalB = b.ingredients.length + b.unresolved;
  return {
    similarity: union.size ? shared.length / union.size : 0,
    shared: shared.map((k) => A.get(k)!), onlyA: [...A.keys()].filter((k) => !B.has(k)).map((k) => A.get(k)!), onlyB: [...B.keys()].filter((k) => !A.has(k)).map((k) => B.get(k)!),
    activesA: actA, activesB: actB, sharedActives: actA.filter((x) => kB.has(normKey(x))),
    onlyActivesA: actA.filter((x) => !kB.has(normKey(x))), onlyActivesB: actB.filter((x) => !kA.has(normKey(x))),
    reliability: (a.unresolved + b.unresolved) / Math.max(1, totalA + totalB) > 0.25 ? "low" : "ok",
  };
}

/** ₹ per ml from MRP and volume. */
export const perMl = (mrp?: number, ml?: number) => (mrp && ml && mrp > 0 && ml > 0 ? mrp / ml : null);

/** Parses OCR'd or typed price text such as "MRP Rs.669.00", "₹ 669", "Rs.6.69/ml", "100 ml", "50g". Never invents: returns what is printed. */
export function parsePriceText(text: string): { mrp?: number; volumeMl?: number; perMlPrinted?: number } {
  const t = text.replace(/,/g, "");
  const out: { mrp?: number; volumeMl?: number; perMlPrinted?: number } = {};
  const per = t.match(/(?:rs\.?|inr|₹)\s*(\d+(?:\.\d+)?)\s*\/\s*(?:ml|g)\b/i);
  if (per) out.perMlPrinted = Number(per[1]);
  const mrp = t.match(/(?:mrp|m\.r\.p\.?|price)?[^\d\n]{0,12}?(?:rs\.?|inr|₹)\s*(\d+(?:\.\d+)?)(?!\s*\/)/i);
  if (mrp) out.mrp = Number(mrp[1]);
  const vol = t.match(/(\d+(?:\.\d+)?)\s*(ml|g|gm|gms)\b/i);
  if (vol) out.volumeMl = Number(vol[1]);
  return out;
}

/** Rank OBF candidates against one saved product. `excluded` lists those dropped for containing something on the avoid list. */
export interface Candidate extends Comparable { code: string; url: string; brands: string; avoidHits: string[] }
export function rankCandidates(base: Comparable, cands: Candidate[], minShared = 3): { ranked: (Candidate & { cmp: Comparison })[]; excluded: Candidate[]; tooFew: number } {
  const excluded = cands.filter((c) => c.avoidHits.length);
  const ok = cands.filter((c) => !c.avoidHits.length);
  const withCmp = ok.map((c) => ({ ...c, cmp: compare(base, c) }));
  const usable = withCmp.filter((c) => c.cmp.shared.length >= minShared);
  return { ranked: usable.sort((x, y) => y.cmp.similarity - x.cmp.similarity), excluded, tooFew: withCmp.length - usable.length };
}
