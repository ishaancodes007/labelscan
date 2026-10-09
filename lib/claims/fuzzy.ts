// Fuzzy phrase finding for printed claims. Printed/OCR text has typos ("Clincally Tested", "Won'n clog pores"), so a phrase matches a
// window of words if the letters-only strings are within a small edit budget that scales with the phrase length (short phrases: exact).
export const normText = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9%]+/g, " ").trim();
const letters = (s: string) => s.replace(/[^a-z0-9]/g, "");

export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); rowMin = Math.min(rowMin, cur[j]); }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
export const editBudget = (keyLen: number) => (keyLen < 10 ? 0 : keyLen < 16 ? 1 : 2);

export interface PhraseHit { phrase: string; matched: string; edits: number }
export function findPhrase(text: string, phrase: string): PhraseHit | null {
  const words = normText(text).split(" ").filter(Boolean);
  const pw = normText(phrase).split(" ").filter(Boolean);
  const key = letters(pw.join(""));
  if (key.length < 5) return null;
  const budget = editBudget(key.length);
  for (let n = Math.max(1, pw.length - 1); n <= pw.length + 1; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const win = words.slice(i, i + n), joined = letters(win.join(""));
      if (joined[0] !== key[0]) continue;
      const d = editDistance(joined, key, budget);
      if (d <= budget) return { phrase, matched: win.join(" "), edits: d };
    }
  }
  return null;
}
