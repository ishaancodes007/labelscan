// Phase 5 end-to-end logic check on the fixture products. Run: npx tsx scripts/phase5_check.ts
// Reports what each feature does on the illustrative sample products. No scores; prints pass/fail for stated expectations only.
import fs from "node:fs";
import { checkRoutine } from "../lib/products/routine";
import { compare, toComparable, parsePriceText, perMl, rankCandidates } from "../lib/products/compare";
import { findPatterns } from "../lib/products/reactions";
import { substitutionsFor } from "../lib/products/actives";
import type { SavedProduct } from "../lib/products/types";

const raw = JSON.parse(fs.readFileSync("backend/fixtures/products/sample_products.json", "utf8")).products as Omit<SavedProduct, "id" | "savedAt" | "unresolved">[];
const P: SavedProduct[] = raw.map((p, i) => ({ ...p, id: `p${i}`, unresolved: [], savedAt: "2026-10-09" }));
const by = (n: string) => P.find((p) => p.name.includes(n))!;
let fail = 0;
const ok = (name: string, c: boolean, extra = "") => { if (!c) fail++; console.log((c ? "PASS " : "FAIL ") + name + (extra ? `  [${extra}]` : "")); };

// 1. routine checker
const r = checkRoutine([by("Retinol"), by("Acne Gel"), by("Glycolic"), by("Daily Moisturizer")]);
ok("retinoid + benzoyl peroxide at the same time -> caution note", r.notes.some((n) => n.kind === "stacking" && n.tier === "caution" && /Benzoyl/.test(n.title) && /Retinoids/.test(n.title)));
ok("retinoid + AHA at the same time -> caution note", r.notes.some((n) => n.kind === "stacking" && n.tier === "caution" && /Alpha/.test(n.title)));
ok("duplicate active: Glycerin etc. are NOT flagged (only notable actives)", !r.notes.some((n) => n.kind === "duplicate" && /Glycerin/.test(n.title)));
ok("no sunscreen marked in the AM -> sunscreen caution (types are marked)", r.sunscreenCheck === "missing" && r.notes.some((n) => n.kind === "sunscreen" && n.tier === "caution"));
ok("every stacking/sunscreen note carries a source", r.notes.filter((n) => n.kind === "stacking" || n.kind === "sunscreen").every((n) => n.source.length > 0));
const r2 = checkRoutine([{ ...by("Retinol"), type: "", when: "" }, { ...by("Glycolic"), type: "", when: "" }]);
ok("types not marked -> asks to mark types, never says sunscreen is missing", r2.sunscreenCheck === "types_not_marked" && !r2.notes.some((n) => n.title.startsWith("No sunscreen")));
const r3 = checkRoutine([{ ...by("Retinol"), when: "pm" }, { ...by("Acne Gel"), when: "am" }]);
ok("retinoid PM and benzoyl peroxide AM -> only a 'different times' note, tier note", r3.notes.some((n) => n.kind === "stacking" && n.tier === "note" && /different times/.test(n.text)) && !r3.notes.some((n) => n.kind === "stacking" && n.tier === "caution"));
const dup = checkRoutine([by("Daily Moisturizer"), { ...by("Plain Lotion"), ingredients: [...by("Plain Lotion").ingredients, "Retinol"] }, by("Retinol")]);
ok("same active (Retinol) in two products -> duplicate note", dup.notes.some((n) => n.kind === "duplicate" && /Retinol/.test(n.title)));

// 2. dupe finder
const c = compare(toComparable(by("Scented Cream A")), toComparable(by("Plain Lotion")));
ok("dupe compare: shared ingredients listed, Parfum only in A", c.shared.includes("Glycerin") && c.onlyA.includes("Parfum") && c.onlyB.includes("Dimethicone"), `similarity ${c.similarity.toFixed(2)}`);
const c2 = compare({ ...toComparable(by("Plain Lotion")), unresolved: 6 }, toComparable(by("Daily Moisturizer")));
ok("dupe compare: many unconfirmed items -> reliability low", c2.reliability === "low");
ok("price per ml: 899/30 = 29.97", Math.abs(perMl(899, 30)! - 29.9667) < 0.01);
const t = parsePriceText("MRP Rs.669.00 (incl. all taxes)  Net Qty 100 ml  Rs.6.69/ml");
ok("price text parse: Rs.6.69/ml printed, MRP 669, 100 ml", t.perMlPrinted === 6.69 && t.mrp === 669 && t.volumeMl === 100, JSON.stringify(t));
ok("price text parse: nothing invented from text without prices", Object.keys(parsePriceText("Aqua, Glycerin")).length === 0);

// 3. product-level alternatives (candidates as the OBF route would supply them, avoid hits precomputed by the UI from the user's profile)
const base = toComparable(by("Scented Cream A"));
const cands = [by("Scented Lotion B"), by("Plain Lotion"), by("Daily Moisturizer")].map((p, i) => ({ name: p.name, ingredients: p.ingredients, unresolved: 0, code: `c${i}`, url: "#", brands: "Sample", avoidHits: p.name.includes("Scented Lotion") ? ["Parfum"] : [] }));
const rk = rankCandidates(base, cands, 2);
ok("alternatives: a candidate with an avoid-list ingredient is excluded, not ranked", rk.excluded.length === 1 && !rk.ranked.some((x) => x.name.includes("Scented Lotion")));
ok("alternatives: ranked by shared-ingredient similarity (Plain Lotion first)", rk.ranked[0]?.name.includes("Plain Lotion"), rk.ranked.map((x) => `${x.name} ${x.cmp.similarity.toFixed(2)}`).join(" | "));
ok("ingredient-level alternative: Retinol -> Bakuchiol with trade-offs and a source", (() => { const s = substitutionsFor("Retinol")[0]?.options[0]; return !!s && s.inci === "BAKUCHIOL" && s.tradeoffs.length >= 2 && s.source.length > 0; })());
ok("ingredient-level alternative: nothing invented for an ingredient with no entry", substitutionsFor("Glycerin").length === 0);

// 4. reaction pattern finder
const rx = (id: string) => ({ id: `r${id}`, productId: id, date: "2026-09-01", note: "" });
const pats = findPatterns(P, [rx("p4"), rx("p5")]);
const pf = pats.find((x) => x.label === "Linalool");
ok("reactions: two reacted products share Linalool and Parfum", !!pf && pats.some((x) => x.label === "Parfum"), pats.map((x) => `${x.kind}:${x.label}`).join(", "));
ok("reactions: ingredient also in an unreacted product is reported as such (Glycerin)", pats.find((x) => x.label === "Glycerin")!.alsoInUnreactedProducts.length > 0);
ok("reactions: one reacted product -> no pattern", findPatterns(P, [rx("p4")]).length === 0);
ok("reactions: no pattern text claims an allergy", !JSON.stringify(pats).match(/allerg(ic|y) to/i));
console.log(fail ? `\n${fail} FAILED` : "\nall pass");
process.exit(fail ? 1 : 0);
