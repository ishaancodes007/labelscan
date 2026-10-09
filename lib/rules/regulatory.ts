// Per-ingredient regulatory status read from the consolidated Regulation (EC) No 1223/2009 (data/regulation_1223_annexes.json,
// produced by scripts/fetch_regulation.py). Reports what the Annexes say; it is not an approval or a safety statement.
import annexes from "../../data/regulation_1223_annexes.json";
import { normKey } from "./data";
import type { Source } from "./types";

interface Row { entry: string; inci: string[]; conditions?: string }
const D = annexes as unknown as { meta: { celex: string; cellar_work: string }; annexes: Record<string, Row[]> };
export const REG_SOURCE: Source = { label: `Regulation (EC) No 1223/2009, consolidated version ${D.meta.celex.slice(-8, -4)}-${D.meta.celex.slice(-4, -2)}-${D.meta.celex.slice(-2)}`, url: `https://publications.europa.eu/resource/cellar/${D.meta.cellar_work}` };
const LABEL: Record<string, string> = {
  II_prohibited_identified: "Prohibited in cosmetic products (Annex II)", III: "Restricted substance (Annex III)", IV: "Permitted colourant (Annex IV)",
  V: "Permitted preservative (Annex V)", VI: "Permitted UV filter (Annex VI)",
};
const INDEX = new Map<string, { annex: string; row: Row }[]>();
for (const [annex, rows] of Object.entries(D.annexes)) for (const row of rows) for (const n of row.inci ?? []) {
  const k = normKey(n); const arr = INDEX.get(k) ?? []; arr.push({ annex, row }); INDEX.set(k, arr);
}
export interface RegLine { text: string; source: Source[] }
export function regulatoryFor(inci: string): RegLine[] {
  return (INDEX.get(normKey(inci)) ?? []).map(({ annex, row }) => ({
    text: `${LABEL[annex]}: entry ${row.entry}${row.conditions ? `. ${row.conditions.length > 320 ? row.conditions.slice(0, 317) + "…" : row.conditions}` : ""}`,
    source: [REG_SOURCE],
  }));
}
