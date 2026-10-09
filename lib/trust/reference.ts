// Reference formula comparison (Open Beauty Facts, crowd-sourced, ODbL). Shown as INFORMATION ONLY: the overlap threshold at which a difference
// would suggest counterfeit packaging has not been calibrated (entries can be empty, outdated or for another market), so it never triggers a notice.
import { normKey } from "../rules/data";
export interface RefProduct { code: string; name: string; brands: string; ingredients_text: string; url: string }
export interface Comparison { shared: string[]; onlyOnPack: string[]; onlyInReference: string[]; refCount: number; packCount: number }

export function refNames(text: string): string[] {
  return text.replace(/\([^)]*\)/g, " ").split(/[,;.]\s*/).map((s) => s.replace(/^\s*(ingredients?\s*[:\-]\s*)/i, "").trim()).filter((s) => s.length > 1);
}
export function compareToReference(pack: string[], refText: string): Comparison {
  const ref = refNames(refText), pk = pack.map((p) => ({ n: p, k: normKey(p) })), rk = ref.map((r) => ({ n: r, k: normKey(r) }));
  const rset = new Set(rk.map((r) => r.k)), pset = new Set(pk.map((p) => p.k));
  return { shared: pk.filter((p) => rset.has(p.k)).map((p) => p.n), onlyOnPack: pk.filter((p) => !rset.has(p.k)).map((p) => p.n),
           onlyInReference: rk.filter((r) => !pset.has(r.k)).map((r) => r.n), refCount: ref.length, packCount: pack.length };
}
