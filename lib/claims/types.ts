import type { Source } from "../rules/types";
export type Verdict = "matches" | "consistent" | "contradiction" | "needs_context" | "not_verifiable";
export interface DetectedClaim { id: string; kind: "free_from" | "ingredient" | "unverifiable"; label: string; matchedText: string; edits: number }
export interface ClaimResult {
  id: string; kind: DetectedClaim["kind"]; label: string; matchedText: string; verdict: Verdict; explanation: string;
  items: number[]; source: Source[]; confidence: "established" | "limited" | "note";
}
export const VERDICT_LABEL: Record<Verdict, string> = {
  matches: "Matches the ingredient list", consistent: "Consistent with the ingredient list", contradiction: "Contradicts the ingredient list",
  needs_context: "Needs context", not_verifiable: "Not verifiable from ingredients",
};
