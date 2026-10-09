// Pattern finder over the user's own reaction log. It reports overlap only; it never says the user is allergic to anything.
import { FAMILIES, familiesOf, normKey, titleCase } from "@/lib/rules/data";
import type { Reaction, SavedProduct } from "./types";

export interface Pattern { kind: "ingredient" | "family"; label: string; reacted: string[]; alsoInUnreactedProducts: string[]; source?: { label: string; url: string }[] }

export function findPatterns(products: SavedProduct[], reactions: Reaction[]): Pattern[] {
  const reactedIds = new Set(reactions.map((r) => r.productId));
  const reacted = products.filter((p) => reactedIds.has(p.id)), others = products.filter((p) => !reactedIds.has(p.id));
  if (reacted.length < 2) return [];
  const out: Pattern[] = [];
  const names = (ps: SavedProduct[]) => ps.map((p) => p.name);
  // identified ingredients shared by 2+ reacted products
  const ing = new Map<string, { label: string; prods: SavedProduct[] }>();
  for (const p of reacted) for (const n of new Set(p.ingredients.map(normKey))) {
    const label = p.ingredients.find((x) => normKey(x) === n)!, e = ing.get(n) ?? { label, prods: [] }; e.prods.push(p); ing.set(n, e);
  }
  for (const [k, e] of ing) if (e.prods.length >= 2)
    out.push({ kind: "ingredient", label: titleCase(e.label), reacted: names(e.prods), alsoInUnreactedProducts: names(others.filter((o) => o.ingredients.some((x) => normKey(x) === k))) });
  // curated families shared by 2+ reacted products (different members count)
  for (const f of FAMILIES) {
    const prods = reacted.filter((p) => p.ingredients.some((x) => familiesOf(x).includes(f.id)));
    if (prods.length < 2) continue;
    // skip when the family overlap is just one ingredient already reported
    const members = new Set(prods.flatMap((p) => p.ingredients.filter((x) => familiesOf(x).includes(f.id)).map(normKey)));
    if (members.size < 2) continue;
    out.push({ kind: "family", label: f.name, reacted: names(prods), source: f.source, alsoInUnreactedProducts: names(others.filter((o) => o.ingredients.some((x) => familiesOf(x).includes(f.id)))) });
  }
  // fewer unreacted products with the same ingredient = a tighter overlap; sort that first
  return out.sort((a, b) => a.alsoInUnreactedProducts.length - b.alsoInUnreactedProducts.length || b.reacted.length - a.reacted.length);
}
