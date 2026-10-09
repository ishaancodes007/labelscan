import { SEED_INCI } from "./seedInci";
import { norm, splitIngredients } from "./parse";
import { pubchemByName } from "./pubchem";

export type BaselineStatus = "inci_exact" | "pubchem_match" | "not_found" | "lookup_unavailable";
export interface BaselineItem { index: number; raw: string; status: BaselineStatus; inci?: string; cid?: number }

const SEED = new Set(SEED_INCI.map(norm));

export async function analyzeBaseline(text: string, usePubChem = true): Promise<BaselineItem[]> {
  const items: BaselineItem[] = [];
  for (const t of splitIngredients(text)) {
    const n = norm(t.raw);
    if (SEED.has(n)) { items.push({ ...t, status: "inci_exact", inci: n }); continue; }
    if (!usePubChem) { items.push({ ...t, status: "not_found" }); continue; }
    const r = await pubchemByName(t.raw);
    if (r.status === "match") items.push({ ...t, status: "pubchem_match", cid: r.cid });
    else items.push({ ...t, status: r.status === "unavailable" ? "lookup_unavailable" : "not_found" });
  }
  return items;
}
