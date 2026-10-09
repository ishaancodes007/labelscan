// Printed-misspelling heuristic (a soft notice, never an accusation). Only words the OCR read with HIGH confidence count, so a blurry photo
// cannot trigger it, and typed text (no OCR confidence) never does.
export const MIN_CONF = 80;       // OCR word confidence needed for a word to count
export const MIN_COUNT = 3;       // "several": at least this many high-confidence words that look like misspellings of ordinary words
const ALPHA = "abcdefghijklmnopqrstuvwxyz";

function edits1(w: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length) out.add(w.slice(0, i) + w.slice(i + 1));                                   // delete
    if (i < w.length - 1) out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));              // transpose
    for (const c of ALPHA) { if (i < w.length) out.add(w.slice(0, i) + c + w.slice(i + 1)); out.add(w.slice(0, i) + c + w.slice(i)); }   // replace, insert
  }
  out.delete(w);
  return out;
}

export interface Misspelling { word: string; suggestion: string }
export interface OcrWordIn { text: string; confidence?: number }
export function findMisspellings(words: OcrWordIn[], dict: Set<string>, exclude: Set<string> = new Set()): { eligible: boolean; found: Misspelling[] } {
  const seen = new Set<string>(); const found: Misspelling[] = [];
  let eligible = false;
  for (const w of words) {
    if (w.confidence === undefined) continue;          // typed text: no OCR confidence, never counted
    eligible = true;
    if (w.confidence < MIN_CONF) continue;
    for (const part of w.text.split(/[^A-Za-z]+/)) {
      const lw = part.toLowerCase();
      if (lw.length < 4 || seen.has(lw) || dict.has(lw) || exclude.has(lw)) continue;
      seen.add(lw);
      const sug = [...edits1(lw)].filter((x) => dict.has(x));
      if (sug.length) found.push({ word: part, suggestion: sug.sort((a, b) => a.length - b.length || a.localeCompare(b))[0] });
    }
  }
  return { eligible, found };
}

export const COUNTERFEIT_NOTICE = "Several printed spelling errors were read on this pack. This can indicate counterfeit packaging, but it can also be a misread photo or a printing mistake. Verify with the manufacturer, or buy from an authorised seller.";
export const shouldNotify = (found: Misspelling[]) => found.length >= MIN_COUNT;

let cached: Promise<Set<string>> | null = null;
/** Lazy-loads the English word list served from this origin (public/words/en.txt). */
export function loadWordSet(url = "/words/en.txt"): Promise<Set<string>> {
  cached ??= fetch(url).then((r) => r.text()).then((t) => new Set(t.split(/\r?\n/).filter(Boolean)));
  return cached;
}
