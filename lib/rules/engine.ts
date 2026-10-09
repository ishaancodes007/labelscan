// Deterministic rules engine. No scores, no verdicts: it reports which curated, sourced rules apply to the ingredients the user has
// accepted or that resolved, and says plainly what it could not check. The LLM has no part in this.
import { FAMILIES, MYTH_NOTES, RULES, lookupKey, normKey, stripParens, titleCase } from "./data";
import { TIER_ORDER, type Banner, type Evaluation, type Finding, type ItemIn, type Profile, type Source, type Tier } from "./types";

const uniq = (list: Source[]): Source[] => [...new Map(list.map((x) => [x.url, x])).values()];
const capTier = (t: Tier, cap: Tier): Tier => (TIER_ORDER[t] < TIER_ORDER[cap] ? cap : t);   // "no stronger than cap"

export interface Identity { inci: string | null; key: string; via: "resolved" | "accepted" | "none" }
/** An item counts as identified only if it resolved, or the user accepted a suggestion. Suggestions are never assumed. */
export function identityOf(it: ItemIn, accepted?: Record<number, string>): Identity {
  const a = accepted?.[it.index];
  if (a) return { inci: a, key: normKey(a), via: "accepted" };
  if (it.status === "resolved" && it.inci_name) return { inci: it.inci_name, key: normKey(it.inci_name), via: "resolved" };
  return { inci: null, key: "", via: "none" };
}

const NEEDS_REVIEW = new Set(["suggested", "ambiguous", "not_found", "lookup_unavailable"]);
const nameOf = (it: ItemIn, id: Identity) => titleCase(id.inci ?? stripParens(it.raw));

export function evaluate(items: ItemIn[], profile: Profile, accepted: Record<number, string> = {}): Evaluation {
  const ids = items.map((it) => identityOf(it, accepted));
  const findings: Finding[][] = items.map(() => []);
  const regulatory: Evaluation["regulatory"] = items.map(() => []);
  const noteFor = (id: string) => MYTH_NOTES.find((n) => n.id === id)!;

  items.forEach((it, i) => {
    const id = ids[i];
    if (id.via !== "none") {
      const hits = lookupKey(id.key);
      // 1. user's avoid list (strongest tier wins per entry; role caps apply to family entries only)
      for (const e of profile.avoid) {
        if (!e.keys.includes(id.key)) continue;
        const fam = e.familyId ? FAMILIES.find((f) => f.id === e.familyId) : hits[0]?.family;
        const member = fam?.members.find((m) => normKey(m.inci) === id.key || (m.aliases ?? []).some((a) => normKey(a) === id.key));
        let tier: Tier = e.strength === "doctor" ? "avoid" : "caution";
        let extra = "";
        let src = fam?.source ?? [];
        let conf = fam?.confidence ?? "note";
        if (member?.cap_tier && !e.specificKeys.includes(id.key)) {   // role-based cap: unclear role + not specifically listed by the user
          tier = capTier(tier, member.cap_tier); extra = ` ${member.role_note ?? ""}`; src = [...src, ...(member.role_source ?? [])]; conf = member.role_confidence ?? "limited";
        }
        const why = e.strength === "doctor" ? "You marked this as doctor-confirmed." : "You marked this as a personal preference.";
        const viaFam = e.kind === "family" ? ` It is part of "${e.label}", which you added to your avoid list.` : e.origin === "patch_test" ? " It came from your patch-test entry." : "";
        findings[i].push({ kind: "avoid_list", tier, ruleId: `avoid:${e.id}`, title: `On your avoid list: ${e.label}`,
          explanation: `${nameOf(it, id)} matches your avoid list. ${why}${viaFam}${extra}`.trim(), source: uniq(src), confidence: conf });
      }
      // 2. profile rules (curated, sourced)
      for (const r of RULES.rules) {
        const applies = (r.condition === "pregnancy" && profile.pregnant);
        if (applies && hits.some((h) => h.family.id === r.family))
          findings[i].push({ kind: "profile_rule", tier: r.tier, ruleId: r.id, title: r.title, explanation: r.explanation, source: r.source, confidence: r.confidence });
      }
      // 3. role notes (e.g. benzyl alcohol) when the user has no avoid-list finding already carrying the note
      for (const h of hits) {
        if (h.member.role_note && !findings[i].some((f) => f.kind === "avoid_list" && f.explanation.includes(h.member.role_note!)))
          findings[i].push({ kind: "role_note", tier: "note", ruleId: `role:${h.family.id}:${normKey(h.member.inci)}`, title: "Role in this product is unclear",
            explanation: h.member.role_note, source: uniq([...(h.member.role_source ?? []), ...h.family.source]), confidence: h.member.role_confidence ?? "limited" });
      }
      // 4. family notes: fatty alcohols are not drying alcohols
      if (hits.some((h) => h.family.id === "fatty_alcohols")) {
        const n = noteFor("fatty_alcohol_not_drying");
        findings[i].push({ kind: "family_note", tier: "note", ruleId: n.id, title: n.title, explanation: n.text, source: n.source, confidence: n.confidence });
      }
      // regulatory status lines from the curated families
      for (const f of new Set(hits.map((h) => h.family))) if (f.regulatory) regulatory[i].push({ text: f.regulatory.text, source: f.regulatory.source, family: f.name });
    } else if (it.status === "suggested" && it.candidates && it.candidates.length >= 2) {
      // candidate note: all top candidates in one family with a candidate_note -> informational, does NOT identify the item
      const top = it.candidates.filter((c) => c.score >= it.candidates![0].score - 0.2).slice(0, 3);
      for (const f of FAMILIES) if (f.candidate_note && top.length >= 2 && top.every((c) => lookupKey(normKey(c.inci_name)).some((h) => h.family.id === f.id)))
        findings[i].push({ kind: "candidate_note", tier: "note", ruleId: `cand:${f.id}`, title: "The possible matches are alike", explanation: f.candidate_note, source: f.source, confidence: f.confidence });
    }
    findings[i].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  });

  // banner: an item is identified if it resolved (including recognised classes) or the user accepted a suggestion
  const idxs = items.map((_it, i) => i).filter((i) => !items[i].optional);
  const isIdentified = (i: number) => ids[i].via !== "none" || items[i].status === "resolved";
  const identified = idxs.filter(isIdentified).length;
  const needsReview = idxs.filter((i) => !isIdentified(i) && NEEDS_REVIEW.has(items[i].status)).length;
  const avoidItems = items.filter((_it, i) => findings[i].some((f) => f.kind === "avoid_list"));
  const hasList = profile.avoid.length > 0;
  let text: string;
  if (!hasList) text = "You have not set an avoid list yet. Add one in your profile to check ingredients against it.";
  else if (avoidItems.length) text = `Contains ${avoidItems.length} ingredient${avoidItems.length > 1 ? "s" : ""} you avoid: ${avoidItems.map((it) => titleCase(stripParens(ids[items.indexOf(it)].inci ?? it.raw))).join(", ")}.`;
  else text = "Nothing on your avoid list was found among the identified ingredients.";
  if (needsReview) text += ` ${needsReview} item${needsReview > 1 ? "s" : ""} still need review.`;
  const banner: Banner = { text, avoidMatches: avoidItems.length, needsReview, identified };

  // myth notes (deterministic triggers over identified items)
  const present = new Set(ids.filter((x) => x.via !== "none").map((x) => x.key));
  const presentFamilies = new Set([...present].flatMap((k) => lookupKey(k).map((h) => h.family.id)));
  const myth = MYTH_NOTES.filter((n) => (n.trigger.family && presentFamilies.has(n.trigger.family)) || (n.trigger.inci && present.has(normKey(n.trigger.inci))) ||
    (n.trigger.any_inci && n.trigger.any_inci.some((x) => present.has(normKey(x))))).map(({ id, title, text, source, confidence }) => ({ id, title, text, source, confidence }));

  return { findings, banner, summary: summarise(items, ids), myth, regulatory };
}

/** One deterministic sentence group built only from listing facts and curated families (function data is not loaded yet). */
function summarise(items: ItemIn[], ids: Identity[]): string {
  const main = items.map((it, i) => ({ it, id: ids[i] })).filter((x) => !x.it.optional);
  if (!main.length) return "";
  const named = main.filter((x) => x.id.via !== "none");
  const parts: string[] = [];
  parts.push(`${main.length} ingredient${main.length > 1 ? "s" : ""} listed; ${named.length} identified${main.length - named.length ? `, ${main.length - named.length} need review` : ""}.`);
  const top = main.slice(0, 3);
  const first = top.map((x) => (x.id.via !== "none" ? nameOf(x.it, x.id) : `\u201c${x.it.raw}\u201d`));
  if (first.length) {
    const waterFirst = main[0].id.key === "AQUA";
    const unconfirmed = top.some((x) => x.id.via === "none");
    parts.push(`${waterFirst ? "Water is listed first, so it is a water-based product. " : ""}The first ${first.length > 1 ? `${first.length} printed items are` : "printed item is"} ${first.join(", ")}${unconfirmed ? " (quoted ones are shown as printed and not confirmed yet)" : ""}. Listing order shows relative amount only for ingredients above 1%; it is not a concentration.`);
  }
  const fam = (id: string) => named.filter((x) => lookupKey(x.id.key).some((h) => h.family.id === id)).map((x) => nameOf(x.it, x.id));
  const fa = fam("fatty_alcohols"), al = fam("eu_fragrance_allergens"), fm = fam("fragrance_mixtures"), pres = fam("isothiazolinones").concat(fam("formaldehyde_releasers"));
  if (fa.length) parts.push(`Includes fatty alcohols (${fa.join(", ")}), which are waxy softeners and not drying alcohols.`);
  if (fm.length) parts.push(`Lists ${fm.join(", ")}: an undisclosed fragrance mixture.`);
  if (al.length) parts.push(`Includes ${al.length} ingredient${al.length > 1 ? "s" : ""} on the EU fragrance-allergen list (${al.join(", ")}).`);
  if (pres.length) parts.push(`Includes preservatives that have documented contact-allergy reports (${pres.join(", ")}).`);
  parts.push("A description of what each ingredient does will appear once CosIng function data is loaded.");
  return parts.join(" ");
}
