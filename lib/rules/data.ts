import families from "../../data/allergen_families.json";
import rules from "../../data/profile_rules.json";
import notes from "../../data/notes.json";
import glossary from "../../data/function_glossary.json";
import type { Family, MythNote, ProfileRule } from "./types";

export const FAMILIES = (families as unknown as { families: Family[] }).families;
export const RULES = (rules as unknown as { rules: ProfileRule[]; no_rule_yet: string[]; no_rule_reason: string });
export const MYTH_NOTES = (notes as unknown as { notes: MythNote[] }).notes;
export const GLOSSARY = glossary as unknown as { terms: { function: string; en: string; hi: string }[]; provenance: string; hindi_reviewed: boolean };

/** Same matching key as the Python service: NFKC, uppercase, A-Z 0-9 only. */
export const normKey = (s: string) => s.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const stripParens = (s: string) => s.replace(/\s*\([^)]*\)/g, "").trim();
export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_m, a, b) => a + b.toUpperCase());

export const familyById = (id: string) => FAMILIES.find((f) => f.id === id);
const memberNames = (m: { inci: string; aliases?: string[] }) => [m.inci, ...(m.aliases ?? [])];

// key -> every (family, member) that has this name
const INDEX = new Map<string, { family: Family; member: Family["members"][number]; via: "name" | "alias" }[]>();
for (const f of FAMILIES) for (const m of f.members) memberNames(m).forEach((n, i) => {
  const k = normKey(n); const arr = INDEX.get(k) ?? []; arr.push({ family: f, member: m, via: i === 0 ? "name" : "alias" }); INDEX.set(k, arr);
});
export const lookupKey = (k: string) => INDEX.get(k) ?? [];

// pattern families (silicones, sulfate surfactants): membership by INCI naming convention
const PATTERNS = FAMILIES.filter((f) => f.patterns?.length).map((f) => ({ f, rx: f.patterns!.map((p) => new RegExp(p.regex, p.flags ?? "i")), ex: f.patterns!.flatMap((p) => p.exclude ?? []).map(normKey) }));
/** Every (family, member) an ingredient belongs to: explicit members by name/alias plus pattern families by INCI name. */
export function hitsFor(inci: string): { family: Family; member: Family["members"][number]; via: "name" | "alias" | "pattern" }[] {
  const out: { family: Family; member: Family["members"][number]; via: "name" | "alias" | "pattern" }[] = [...lookupKey(normKey(inci))];
  const name = inci.toUpperCase();
  for (const p of PATTERNS) if (!out.some((h) => h.family.id === p.f.id) && p.rx.some((r) => r.test(name)) && !p.ex.includes(normKey(inci)))
    out.push({ family: p.f, member: { inci: name }, via: "pattern" });
  return out;
}
export const membersKeys = (f: Family) => [...new Set(f.members.flatMap(memberNames).map(normKey))];
export const familiesOf = (inci: string) => [...new Set(lookupKey(normKey(inci)).map((h) => h.family.id))];
