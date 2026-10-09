// Deterministic claim checker. A verdict compares a printed claim with the ingredient list; it never judges the product.
import claims from "../../data/claims.json";
import { hitsFor, normKey, titleCase } from "../rules/data";
import { identityOf } from "../rules/engine";
import type { ItemIn, Source } from "../rules/types";
import type { ClaimResult, DetectedClaim, Verdict } from "./types";

const C = claims as unknown as {
  free_from: { id: string; label: string; logic: string; family?: string; reason?: string; source: Source[]; confidence: ClaimResult["confidence"] }[];
  ingredient_claims: { id: string; label: string; inci: string[]; inci_patterns: string[]; source: Source[]; confidence: ClaimResult["confidence"]; note: string }[];
  unverifiable: { id: string; label: string; reason: string }[];
  unverifiable_basis: Source[]; sources: Record<string, Source>;
};
const NEEDS_REVIEW = new Set(["suggested", "ambiguous", "not_found", "lookup_unavailable"]);
interface Ident { i: number; inci: string; key: string; optional: boolean }

export function checkClaims(detected: DetectedClaim[], items: ItemIn[], accepted: Record<number, string> = {}): ClaimResult[] {
  const ids = items.map((it) => identityOf(it, accepted));
  const identified: Ident[] = items.flatMap((it, i) => (ids[i].via !== "none" ? [{ i, inci: ids[i].inci!, key: ids[i].key, optional: !!it.optional }] : []));
  const colorants = items.map((it, i) => ({ it, i })).filter(({ it }) => it.status === "resolved" && it.category === "colorant");
  const unreviewed = items.filter((it, i) => !it.optional && ids[i].via === "none" && NEEDS_REVIEW.has(it.status)).length;
  const caveat = unreviewed ? ` ${unreviewed} ingredient${unreviewed > 1 ? "s" : ""} on the list ${unreviewed > 1 ? "are" : "is"} not confirmed yet, so something relevant could be among them.` : "";
  const fam = (id: string) => identified.filter((x) => hitsFor(x.inci).some((h) => h.family.id === id));
  const names = (l: Ident[]) => l.map((x) => titleCase(x.inci)).join(", ");
  const out: ClaimResult[] = [];

  for (const d of detected) {
    const base = { id: d.id, kind: d.kind, label: d.label, matchedText: d.matchedText };
    let verdict: Verdict, explanation: string, idx: number[] = [], source: Source[] = [], confidence: ClaimResult["confidence"] = "note";

    if (d.kind === "unverifiable") {
      const u = C.unverifiable.find((x) => x.id === d.id)!;
      verdict = "not_verifiable"; source = C.unverifiable_basis; confidence = "established";
      explanation = `${u.reason} EU rules require cosmetic claims to be supported by adequate and verifiable evidence (Regulation (EU) No 655/2013); that evidence is kept in the product's information file, not on the label.`;
    } else if (d.kind === "free_from") {
      const cfg = C.free_from.find((x) => x.id === d.id)!; source = cfg.source; confidence = cfg.confidence;
      if (cfg.logic === "unsupported") {
        verdict = "needs_context"; explanation = cfg.reason ?? "This claim cannot be checked yet.";
      } else if (cfg.logic === "fragrance") {
        const parfum = fam("fragrance_mixtures"), allergens = fam("eu_fragrance_allergens");
        const benzyl = allergens.filter((x) => x.key === "BENZYLALCOHOL"), others = allergens.filter((x) => x.key !== "BENZYLALCOHOL");
        const otherPres = fam("preservatives_annex_v").filter((x) => x.key !== "BENZYLALCOHOL");
        if (parfum.length) { verdict = "contradiction"; idx = parfum.map((x) => x.i); explanation = `The ingredient list names ${names(parfum)}, an undisclosed fragrance mixture.`; }
        else if (others.length) {
          verdict = "needs_context"; idx = others.map((x) => x.i);
          explanation = `No "Parfum" or "Fragrance" is listed, but the list names ingredients on the EU labelled fragrance-allergen list (${names(others)}). These are usually used for scent, though a label cannot show why a given one was added.${caveat}`;
        } else if (benzyl.length && !otherPres.length) {
          verdict = "needs_context"; idx = benzyl.map((x) => x.i);
          explanation = `Benzyl alcohol is on the labelled fragrance-allergen list and no other preservative is named, so it could be there as a preservative or for scent; the label cannot tell. Annex III applies its allergen entry "for purposes other than inhibiting the development of microorganisms in the product".${caveat}`;
        } else if (benzyl.length) {
          verdict = unreviewed ? "needs_context" : "consistent"; idx = [...benzyl.map((x) => x.i), ...otherPres.map((x) => x.i)];
          explanation = `No fragrance ingredient (Parfum, Fragrance or Aroma) is named. Benzyl alcohol is on the EU labelled fragrance-allergen list, but this list also names other preservatives (${names(otherPres)}), so benzyl alcohol is probably acting as a preservative here (Annex III entry 45 applies only "for purposes other than inhibiting the development of microorganisms"; it is also a permitted preservative, Annex V entry 34). This is consistent with the claim; ingredients alone cannot prove that nothing is added for scent.${caveat}`;
        } else {
          verdict = unreviewed ? "needs_context" : "consistent";
          explanation = `No fragrance ingredient (Parfum, Fragrance or Aroma) or labelled fragrance allergen is named among the identified ingredients. Ingredients alone cannot prove that nothing is added for scent.${caveat}`;
        }
      } else if (cfg.logic === "alcohol") {
        const solv = fam("solvent_alcohols"), fatty = fam("fatty_alcohols");
        if (solv.length) { verdict = "contradiction"; idx = solv.map((x) => x.i); explanation = `The list names ${names(solv)}, a solvent alcohol.`; }
        else {
          verdict = unreviewed ? "needs_context" : "consistent"; idx = fatty.map((x) => x.i);
          explanation = `No solvent alcohol (ethanol, alcohol denat., isopropyl alcohol) is named.${fatty.length ? ` ${names(fatty)} ${fatty.length > 1 ? "are" : "is"} a fatty alcohol (a waxy softener) and does not contradict an "alcohol-free" claim.` : ""}${caveat}`;
        }
      } else if (cfg.logic === "colorant") {
        const pres = colorants.filter(({ it }) => !it.optional), maybe = colorants.filter(({ it }) => it.optional);
        if (pres.length) { verdict = "contradiction"; idx = pres.map((x) => x.i); explanation = `The list names colourants (${pres.map((x) => x.it.raw).join(", ")}).`; }
        else if (maybe.length) { verdict = "needs_context"; idx = maybe.map((x) => x.i); explanation = `Colourants appear only in a "may contain" section (${maybe.map((x) => x.it.raw).join(", ")}): they are used in some shades only.${caveat}`; }
        else { verdict = unreviewed ? "needs_context" : "consistent"; explanation = `No colourant (CI number) is named.${caveat}`; }
      } else {
        const members = fam(cfg.family!); const defn = cfg.family === "sulfate_surfactants" ? " 'Sulfate-free' is not legally defined; matching here is by INCI name (alkyl sulfate cleansers; mineral sulfates are not counted)." : cfg.family === "silicones" ? " Matching is by INCI name (silica and silicates are not silicones)." : "";
        if (members.length) { verdict = "contradiction"; idx = members.map((x) => x.i); explanation = `The list names ${names(members)}.${defn}`; }
        else { verdict = unreviewed ? "needs_context" : "consistent"; explanation = `None of the identified ingredients belongs to this family.${defn}${caveat}`; }
      }
    } else {
      const cfg = C.ingredient_claims.find((x) => x.id === d.id)!; source = cfg.source; confidence = cfg.confidence;
      const rx = cfg.inci_patterns.map((p) => new RegExp(p, "i")), set = new Set(cfg.inci.map(normKey));
      const hit = identified.filter((x) => set.has(x.key) || rx.some((r) => r.test(x.inci)));
      if (hit.length) { verdict = "matches"; idx = hit.map((x) => x.i); explanation = `Found in the list: ${names(hit)}.${cfg.note ? ` ${cfg.note}` : ""}`; }
      else if (unreviewed) { verdict = "needs_context"; explanation = `${cfg.label} is not among the identified ingredients.${caveat}`; }
      else { verdict = "contradiction"; explanation = `${cfg.label} (or a form of it) is not named in the ingredient list.${cfg.note ? ` ${cfg.note}` : ""}`; }
    }
    out.push({ ...base, verdict: verdict!, explanation: explanation!, items: idx, source, confidence });
  }
  const order: Verdict[] = ["contradiction", "needs_context", "matches", "consistent", "not_verifiable"];
  return out.sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict));
}
