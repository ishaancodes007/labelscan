// Avoid-list expansion: a user types ONE name; we offer every other name for it and the curated family, each with its source.
import { FAMILIES, hitsFor, membersKeys, normKey, titleCase } from "./data";
import type { AvoidEntry, Family, Member, Strength } from "./types";

export interface Expansion {
  text: string; key: string;
  hits: { family: Family; member: Member; via: "name" | "alias" | "pattern" }[];
  otherNames: string[];            // other names for the same ingredient (aliases / INCI name), excluding what was typed
  families: Family[];              // families the ingredient belongs to (offered as "add the whole family")
  nameFamilies: Family[];          // the user typed a family name itself (e.g. "formaldehyde releasers")
}

export function expandAvoid(text: string): Expansion {
  const key = normKey(text);
  const hits = key ? hitsFor(text.trim()) : [];
  const typed = text.trim().toUpperCase();
  const other = new Set<string>();
  for (const h of hits) for (const n of [h.member.inci, ...(h.member.aliases ?? [])]) if (normKey(n) !== key) other.add(n);
  const families = [...new Map(hits.map((h) => [h.family.id, h.family])).values()];
  const nameFamilies = key.length >= 5 ? FAMILIES.filter((f) => normKey(f.name) === key || normKey(f.name).includes(key) && key.length >= 8) : [];
  void typed;
  return { text: text.trim(), key, hits, otherNames: [...other], families, nameFamilies };
}

let seq = 0;
const newId = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeIngredientEntry(x: Expansion, strength: Strength, origin: AvoidEntry["origin"] = "typed", note?: string): AvoidEntry {
  const m = x.hits[0]?.member;
  const names = m ? [m.inci, ...(m.aliases ?? [])] : [x.text];
  const keys = [...new Set([...names.map(normKey), x.key])].filter(Boolean);
  return { id: newId(), label: m ? titleCase(m.inci) : x.text, kind: "ingredient", keys, specificKeys: keys, strength, origin,
    note: note ?? (m ? undefined : "No other names are known for this yet."), addedAt: new Date().toISOString() };
}

export function makeFamilyEntry(f: Family, strength: Strength): AvoidEntry {
  return { id: newId(), label: f.name, kind: "family", familyId: f.id, keys: membersKeys(f), specificKeys: [], strength,
    origin: "family_expansion", addedAt: new Date().toISOString() };
}
