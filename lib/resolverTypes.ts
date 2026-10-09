// TypeScript mirror of backend/app/models.py (POST /v1/ingredients/resolve). Keep the two in sync.
export type ResolveStatus = "resolved" | "suggested" | "ambiguous" | "not_found" | "lookup_unavailable";
export type ResolveLayer =
  | "inci_exact" | "inci_alias" | "category_recognized" | "pubchem_match"
  | "fuzzy" | "ai_agent" | "not_found" | "lookup_unavailable";

export interface TokenIn { index: number; raw: string; ocrWordConfidence?: number }
export interface ResolveRequest { tokens: TokenIn[]; useAgent?: boolean; noMerge?: string[]; locale?: string }

export interface Candidate {
  inci_name: string; score: number; source: "dictionary" | "pubchem" | "ai_agent";
  source_id?: string | null; edits: string[]; note?: string | null;
}
export interface ResolvedItem {
  index: number; sourceIndex: number; raw: string; fragments: string[];
  mergedFrom?: number | null; splitFrom?: string | null; ocrWordConfidence?: number | null;
  optional: boolean; tags: string[]; status: ResolveStatus; layer: ResolveLayer;
  inci_name?: string | null; category?: string | null; cas?: string | null; ec?: string | null;
  source?: string | null; source_id?: string | null; candidates: Candidate[];
  highConfidence: boolean; notes: string[];
}
export interface RemovedFragment { position: number; sourceIndex: number; raw: string; reason: string; kind: string }
export interface ResolveMeta {
  dictionaryVersion: string; dictionarySourceDate?: string | null; dictionarySource: string;
  agentStatus: "off" | "not_implemented" | "unavailable" | "rate_limited" | "on";
  agentTokensProcessed?: number; agentTokensSkipped?: number;
  pubchemStatus: "on" | "off" | "unavailable"; timings: Record<string, number>; thresholds: Record<string, number>;
}
export interface ResolveResponse { items: ResolvedItem[]; removed: RemovedFragment[]; meta: ResolveMeta }
