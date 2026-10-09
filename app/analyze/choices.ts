// The user's review decisions. SESSION STATE ONLY (React state; never written to localStorage or sent anywhere).
// Keyed by the normalized printed text so that a decision survives a re-run of the analysis for the same ingredient.
import { normKey } from "@/lib/rules/data";

export interface Choices {
  accepted: Record<string, string>;      // printed text -> INCI name the user accepted
  kept: Record<string, true>;            // "keep as typed": stays unconfirmed, no longer counted as needing review
  notIngredient: Record<string, true>;   // "not an ingredient": moved to the removed list (restorable)
  restored: { raw: string }[];           // removed fragments the user restored (added back, unchecked)
  noMerge: string[];                     // fragments the user asked to keep separate ("Split merge"); sent with the next analysis
}
export const NO_CHOICES: Choices = { accepted: {}, kept: {}, notIngredient: {}, restored: [], noMerge: [] };
export const ck = (raw: string) => normKey(raw);
