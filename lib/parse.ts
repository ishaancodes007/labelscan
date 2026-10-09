// Starter INCI parsing: split on commas/semicolons outside parentheses. No fuzzy logic, no merging.
export interface Token { index: number; raw: string }

export function splitIngredients(text: string): Token[] {
  const cleaned = text.replace(/^\s*ingredients?\s*[:\-]?\s*/i, "").replace(/\s+/g, " ");
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of cleaned) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean).map((raw, index) => ({ index, raw }));
}

export const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9/,.\- ]/g, "").replace(/\s+/g, " ").trim();
