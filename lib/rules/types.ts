// Rules authority (TypeScript). Runs in the browser so the profile and avoid list never leave the device.
export type Tier = "avoid" | "caution" | "note";
export const TIER_ORDER: Record<Tier, number> = { avoid: 0, caution: 1, note: 2 };
export interface Source { label: string; url: string }
export type Strength = "doctor" | "preference";   // doctor-confirmed = hard rule (avoid); preference = soft rule (caution)
export type Confidence = "established" | "limited" | "note";

export interface Member {
  inci: string; aliases?: string[]; cap_tier?: Tier; role_note?: string; role_source?: Source[]; role_confidence?: Confidence;
  annex3_entry?: string; annex5_entry?: string; max?: string; status?: string; regulatory_note?: string;
}
export interface FamilyPattern { regex: string; flags?: string; exclude?: string[] }
export interface Family {
  id: string; name: string; kind: string; description: string; members: Member[]; source: Source[];
  regulatory?: { text: string; source: Source[] }; candidate_note?: string; patterns?: FamilyPattern[]; last_verified: string; confidence: Confidence; limits: string;
}
export interface ProfileRule { id: string; condition: string; family: string; tier: Tier; title: string; explanation: string; source: Source[]; confidence: Confidence; last_verified: string }
export interface MythNote { id: string; trigger: { family?: string; inci?: string; any_inci?: string[] }; title: string; text: string; source: Source[]; confidence: Confidence }

export interface AvoidEntry {
  id: string; label: string; kind: "ingredient" | "family"; familyId?: string;
  keys: string[];                 // every normalized name this entry matches (INCI + aliases)
  specificKeys: string[];         // names the user typed themselves (a family entry has none): lifts a role-based cap
  strength: Strength; origin: "typed" | "patch_test" | "family_expansion"; note?: string; addedAt: string;
}
export interface PatchTest { id: string; text: string; result: "reacted" | "no_reaction"; date?: string; doctorConfirmed: boolean }
export interface Profile {
  version: 1; skinType: "" | "dry" | "oily" | "combination" | "normal" | "sensitive"; concerns: string[];
  pregnant: boolean; breastfeeding: boolean; babyChild: boolean; avoid: AvoidEntry[]; patchTests: PatchTest[];
}
export const EMPTY_PROFILE: Profile = { version: 1, skinType: "", concerns: [], pregnant: false, breastfeeding: false, babyChild: false, avoid: [], patchTests: [] };

/** Item as the rules see it (mapped from the /api/analyze response). */
export interface ItemIn {
  index: number; raw: string; status: string; layer?: string; inci_name?: string | null; category?: string | null;
  candidates?: { inci_name: string; score: number }[]; highConfidence?: boolean; source?: string | null; optional?: boolean;
}
export interface Finding {
  kind: "avoid_list" | "profile_rule" | "role_note" | "family_note" | "candidate_note";
  tier: Tier; ruleId: string; title: string; explanation: string; source: Source[]; confidence: Confidence;
}
export interface Banner { text: string; avoidMatches: number; needsReview: number; identified: number }
export interface Evaluation {
  findings: Finding[][];            // indexed like the input items
  banner: Banner; summary: string; myth: { id: string; title: string; text: string; source: Source[]; confidence: Confidence }[];
  regulatory: (null | { text: string; source: Source[]; family: string })[][];   // per item: regulatory status lines (from curated families)
}
