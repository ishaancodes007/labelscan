import { EMPTY_PROFILE, type Profile, type Strength } from "./types";
import { expandAvoid, makeFamilyEntry, makeIngredientEntry } from "./avoid";
import { familyById } from "./data";

/** Build a profile from a plain spec (used by the golden check and tests; the UI builds entries interactively). */
export function buildProfile(spec: { avoidFamilies?: string[]; avoidIngredients?: string[]; strength?: Strength; pregnant?: boolean; breastfeeding?: boolean; babyChild?: boolean }): Profile {
  const strength = spec.strength ?? "doctor";
  const avoid = [
    ...(spec.avoidFamilies ?? []).map((id) => { const f = familyById(id); if (!f) throw new Error(`unknown family ${id}`); return makeFamilyEntry(f, strength); }),
    ...(spec.avoidIngredients ?? []).map((t) => makeIngredientEntry(expandAvoid(t), strength)),
  ];
  return { ...EMPTY_PROFILE, pregnant: !!spec.pregnant, breastfeeding: !!spec.breastfeeding, babyChild: !!spec.babyChild, avoid };
}
