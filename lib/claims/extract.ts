import claims from "../../data/claims.json";
import { findPhrase } from "./fuzzy";
import type { DetectedClaim } from "./types";

interface Cfg {
  free_from: { id: string; label: string; phrases: string[] }[];
  ingredient_claims: { id: string; label: string; terms: string[] }[];
  unverifiable: { id: string; label: string; phrases: string[] }[];
  vitamin_codes: Record<string, string>;
}
export const CLAIMS = claims as unknown as Cfg & Record<string, unknown>;

/** "Vitamin E & B3 And Pro-vitamin B5" -> E, B3, B5 (pro). Printed lists share one "vitamin" word. */
export function parseVitaminLists(text: string): { code: string; pro: boolean; matched: string }[] {
  const out: { code: string; pro: boolean; matched: string }[] = [];
  const t = text.replace(/[’`]/g, "'");
  const rx = /\b(pro-?\s?)?vitamins?\s+([a-z]\d?)\b((?:\s*(?:,|&|\+|\band\b)\s*(?:pro-?\s?vitamins?\s*)?[a-z]\d?\b)*)/gi;
  for (const m of t.matchAll(rx)) {
    const rest = (m[3] ?? "").split(/\s*(?:,|&|\+|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
    const parts = [{ code: m[2], pro: !!m[1] }, ...rest.map((r) => ({ code: r.replace(/^pro-?\s?vitamins?\s*/i, ""), pro: /^pro/i.test(r) }))];
    for (const p of parts) if (/^[a-z]\d?$/i.test(p.code)) out.push({ code: p.code.toUpperCase(), pro: p.pro, matched: `${p.pro ? "Pro-vitamin" : "Vitamin"} ${p.code.toUpperCase()}` });
  }
  return out;
}

export function extractClaims(text: string): DetectedClaim[] {
  const found = new Map<string, DetectedClaim>();
  const add = (c: DetectedClaim) => { if (!found.has(c.id)) found.set(c.id, c); };
  for (const f of CLAIMS.free_from) for (const p of f.phrases) { const h = findPhrase(text, p); if (h) { add({ id: f.id, kind: "free_from", label: f.label, matchedText: h.matched, edits: h.edits }); break; } }
  for (const u of CLAIMS.unverifiable) for (const p of u.phrases) { const h = findPhrase(text, p); if (h) { add({ id: u.id, kind: "unverifiable", label: u.label, matchedText: h.matched, edits: h.edits }); break; } }
  for (const v of parseVitaminLists(text)) {
    const id = CLAIMS.vitamin_codes[v.code]; const cfg = CLAIMS.ingredient_claims.find((c) => c.id === id);
    if (cfg) add({ id, kind: "ingredient", label: cfg.label, matchedText: v.matched, edits: 0 });
  }
  for (const c of CLAIMS.ingredient_claims) for (const t of c.terms) { const h = findPhrase(text, t); if (h) { add({ id: c.id, kind: "ingredient", label: c.label, matchedText: h.matched, edits: h.edits }); break; } }
  return [...found.values()];
}
