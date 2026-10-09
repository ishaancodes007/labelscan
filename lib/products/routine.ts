// Deterministic routine checker. No verdicts or scores: it reports which sourced notes apply and what it could not check.
import { normKey } from "@/lib/rules/data";
import type { Confidence, Source } from "@/lib/rules/types";
import { STACKING, activesIn, classById } from "./actives";
import type { SavedProduct } from "./types";

export interface RoutineNote { kind: "stacking" | "duplicate" | "timing" | "sunscreen" | "coverage"; tier: "caution" | "note"; title: string; text: string; source: Source[]; confidence: Confidence | "note" }
export interface RoutineReport { notes: RoutineNote[]; am: string[]; pm: string[]; unplaced: string[]; sunscreenCheck: "present" | "missing" | "types_not_marked" | "not_needed" }

export const MIN_PRODUCTS = 2, MAX_PRODUCTS = 6;
const inAm = (p: SavedProduct) => p.when === "am" || p.when === "both";
const inPm = (p: SavedProduct) => p.when === "pm" || p.when === "both";

export function checkRoutine(products: SavedProduct[]): RoutineReport {
  const notes: RoutineNote[] = [];
  const act = products.map((p) => ({ p, a: activesIn(p.ingredients) }));
  const classesOf = (x: (typeof act)[number]) => new Set(x.a.map((y) => y.cls));
  const ids = (cls: string) => act.filter((x) => classesOf(x).has(cls));

  // 1. active stacking: two actives in the same routine, in different products, at an overlapping time (or time not set)
  for (const s of STACKING) {
    for (const A of ids(s.a)) for (const B of ids(s.b)) {
      if (A.p.id === B.p.id) continue;
      const overlap = !A.p.when || !B.p.when || (inAm(A.p) && inAm(B.p)) || (inPm(A.p) && inPm(B.p));
      const sep = !overlap;
      notes.push({ kind: "stacking", tier: sep ? "note" : s.tier, title: `${classById(s.a).name} with ${classById(s.b).name}: ${A.p.name} and ${B.p.name}`,
        text: sep ? `You use these at different times of day, which is the usual way sources suggest handling this. ${s.text}` : s.text, source: s.source, confidence: s.confidence });
    }
  }
  // 2. duplicate actives across products (same INCI name, or same class)
  const byInci = new Map<string, { label: string; names: string[] }>();
  for (const x of act) for (const y of x.a) {
    const k = normKey(y.inci), e = byInci.get(k) ?? { label: y.inci, names: [] };
    if (!e.names.includes(x.p.name)) e.names.push(x.p.name);
    byInci.set(k, e);
  }
  for (const e of byInci.values()) if (e.names.length > 1)
    notes.push({ kind: "duplicate", tier: "note", title: `${e.label} appears in ${e.names.length} products`, text: `${e.names.join(", ")} all list ${e.label}. Using several products with the same active can add up. Ingredient lists do not show how much each contains.`, source: [], confidence: "note" });
  for (const c of ["retinoid", "aha"]) {
    const prods = ids(c);
    const distinct = new Set(prods.flatMap((x) => x.a.filter((y) => y.cls === c).map((y) => normKey(y.inci))));
    if (prods.length > 1 && distinct.size > 1)
      notes.push({ kind: "duplicate", tier: "note", title: `More than one ${classById(c).name.toLowerCase()} product`, text: `${prods.map((x) => x.p.name).join(", ")} contain different members of the same family.`, source: classById(c).source, confidence: classById(c).confidence });
  }
  // 3. sun-sensitising actives -> sunscreen
  const sunAct = act.filter((x) => x.a.some((y) => classById(y.cls).sun_sensitising));
  const marked = products.some((p) => p.type !== "");
  const amSun = products.some((p) => p.type === "sunscreen" && inAm(p));
  let sunscreenCheck: RoutineReport["sunscreenCheck"] = "not_needed";
  if (!marked) sunscreenCheck = "types_not_marked";
  else sunscreenCheck = amSun ? "present" : "missing";
  if (sunAct.length) {
    const cls = [...new Set(sunAct.flatMap((x) => x.a.map((y) => y.cls)).filter((c) => classById(c).sun_sensitising))];
    const src = cls.flatMap((c) => classById(c).source);
    if (sunscreenCheck === "missing")
      notes.push({ kind: "sunscreen", tier: "caution", title: "No sunscreen marked in your morning routine", text: `${sunAct.map((x) => x.p.name).join(", ")} contain ${cls.map((c) => classById(c).name).join(" and ")}, which sources link to sun sensitivity. No product marked as sunscreen is set for the morning.`, source: src, confidence: "limited" });
    else if (sunscreenCheck === "types_not_marked")
      notes.push({ kind: "sunscreen", tier: "note", title: "Mark your product types to check sunscreen", text: "Your routine contains an active that sources link to sun sensitivity, but you have not marked what type each product is, so sunscreen could not be checked.", source: src, confidence: "limited" });
    else notes.push({ kind: "sunscreen", tier: "note", title: "A sunscreen is marked for the morning", text: "That is what sources advise with these actives. This tool cannot tell whether the product is enough for your needs.", source: src, confidence: "limited" });
  }
  // 4. timing suggestions (from the notes above and the class sources; suggestions, not instructions)
  for (const x of act) for (const y of x.a) {
    if (y.cls === "retinoid" && x.p.when === "am")
      notes.push({ kind: "timing", tier: "note", title: `${x.p.name}: you set it for the morning`, text: "Sources describe retinoids as raising sun sensitivity; the stacking advice above suggests the evening for retinoids. Check the product's own directions.", source: classById("retinoid").source, confidence: "limited" });
  }
  const dedupe = new Set<string>();
  const uniqNotes = notes.filter((n) => { const k = n.title + n.kind; if (dedupe.has(k)) return false; dedupe.add(k); return true; });
  // coverage: unresolved ingredients limit every check
  const unres = products.filter((p) => p.unresolved.length);
  if (unres.length) uniqNotes.push({ kind: "coverage", tier: "note", title: "Some ingredients are not confirmed",
    text: `${unres.map((p) => `${p.name} (${p.unresolved.length})`).join(", ")} still have unconfirmed ingredients. Only the sourced actives in data/actives.json are checked, so a missing note is not a clearance.`, source: [], confidence: "note" });
  return {
    notes: uniqNotes,
    am: products.filter(inAm).map((p) => p.name), pm: products.filter(inPm).map((p) => p.name), unplaced: products.filter((p) => !p.when).map((p) => p.name), sunscreenCheck,
  };
}
