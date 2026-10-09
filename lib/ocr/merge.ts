// Multi-photo merge: OCR each photo, split into ingredient segments, align the sequences (semi-global
// Needleman-Wunsch: the photos overlap only partially) and keep the higher-confidence reading at conflicts.
// Every segment records which photo(s) it came from. Nothing is merged unless >= MIN_MATCHES segments align.
export interface MWord { text: string; confidence: number }
export interface MSegment { text: string; conf: number; words: MWord[]; sources: string[]; conflict?: boolean }
export interface MergeResult { segments: MSegment[]; matched: number; overlapFound: boolean; warnings: string[] }

export const MATCH_SIM = 0.75;   // two segments are "the same ingredient" if their similarity is at least this
export const MIN_RUN = 2;        // an overlap is a CONTIGUOUS run of at least this many matching segments; scattered matches
                                 // (two different products sharing e.g. Dimethicone and Citric Acid) are not an overlap

const keyOf = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function similarity(a: string, b: string): number {
  const x = keyOf(a), y = keyOf(b);
  if (!x || !y) return 0;
  const m = x.length, n = y.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Split OCR lines into ingredient segments on commas/semicolons (outside parentheses), rejoining hyphenated line breaks. */
export function segmentsFromLines(lines: { words: MWord[] }[], photoId: string): MSegment[] {
  const out: MSegment[] = [];
  let cur: MWord[] = [], depth = 0;
  const flush = () => {
    const text = cur.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push({ text, conf: cur.reduce((a, w) => a + w.confidence, 0) / cur.length, words: cur, sources: [photoId] });
    cur = [];
  };
  lines.forEach((line, li) => {
    line.words.forEach((w, wi) => {
      let t = w.text;
      const lastOfLine = wi === line.words.length - 1;
      if (lastOfLine && li < lines.length - 1 && /[A-Za-z]-$/.test(t) && lines[li + 1].words.length) {   // "Homo-" / "salate"
        const next = lines[li + 1].words[0];
        lines[li + 1] = { words: [{ text: "", confidence: next.confidence }, ...lines[li + 1].words.slice(1)] };
        t = t.slice(0, -1) + next.text;
      }
      if (!t) return;
      let piece = "";
      for (const ch of t) {
        if (ch === "(") depth++;
        if (ch === ")") depth = Math.max(0, depth - 1);
        if ((ch === "," || ch === ";") && depth === 0) { if (piece) cur.push({ text: piece, confidence: w.confidence }); piece = ""; flush(); }
        else piece += ch;
      }
      if (piece) cur.push({ text: piece, confidence: w.confidence });
    });
  });
  flush();
  const first = out[0];
  if (first) {   // drop a leading "INGREDIENTS:" label and any decoration/junk the OCR read before it
    const k = first.words.findIndex((w) => /^ingredients?:?$/i.test(w.text));
    if (k >= 0 && k <= 4) first.words = first.words.slice(k + 1);
    if (first.words.length) { first.text = first.words.map((w) => w.text).join(" "); first.conf = first.words.reduce((a, w) => a + w.confidence, 0) / first.words.length; }
    else out.shift();
  }
  return out;
}

function pickReading(a: MSegment, b: MSegment): MSegment {
  const sources = [...new Set([...a.sources, ...b.sources])];
  if (keyOf(a.text) === keyOf(b.text)) return { ...(a.conf >= b.conf ? a : b), sources };
  let words: MWord[];
  if (a.words.length === b.words.length) words = a.words.map((w, i) => (w.confidence >= b.words[i].confidence ? w : b.words[i]));   // per-word
  else words = (a.conf >= b.conf ? a : b).words;                                                                                     // whole segment
  return { text: words.map((w) => w.text).join(" "), conf: words.reduce((s, w) => s + w.confidence, 0) / words.length, words, sources, conflict: true };
}

/** Semi-global alignment of two segment sequences; returns the merged sequence in reading order. */
export function mergeTwo(A: MSegment[], B: MSegment[]): MergeResult {
  const n = A.length, m = B.length, GAP = -0.5;
  const S = (i: number, j: number) => { const s = similarity(A[i].text, B[j].text); return s >= MATCH_SIM ? 2 * s : -1; };
  const H = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));   // free leading gaps: row/col 0 stay 0
  const T = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));      // 1 diag, 2 up (A only), 3 left (B only)
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const d = H[i - 1][j - 1] + S(i - 1, j - 1), u = H[i - 1][j] + GAP, l = H[i][j - 1] + GAP;
    H[i][j] = Math.max(d, u, l); T[i][j] = H[i][j] === d ? 1 : H[i][j] === u ? 2 : 3;
  }
  let bi = n, bj = m, best = -Infinity;      // free trailing gaps: best score on the last row or column
  for (let i = 0; i <= n; i++) if (H[i][m] > best) { best = H[i][m]; bi = i; bj = m; }
  for (let j = 0; j <= m; j++) if (H[n][j] > best) { best = H[n][j]; bi = n; bj = j; }
  const ops: ("both" | "a" | "b")[] = [];
  let i = bi, j = bj;
  while (i > 0 && j > 0) {
    if (T[i][j] === 1) { ops.push("both"); i--; j--; }
    else if (T[i][j] === 2) { ops.push("a"); i--; } else { ops.push("b"); j--; }
  }
  const out: MSegment[] = [];
  const headA = A.slice(0, i), headB = B.slice(0, j);
  out.push(...headA, ...headB);   // leading, un-overlapped parts (A's before B's)
  let ai = i, bj2 = j, matched = 0, run = 0, longestRun = 0;
  for (const op of ops.reverse()) {
    if (op === "both") {
      if (similarity(A[ai].text, B[bj2].text) >= MATCH_SIM) { out.push(pickReading(A[ai], B[bj2])); matched++; run++; longestRun = Math.max(longestRun, run); }
      else { out.push(A[ai], B[bj2]); run = 0; }
      ai++; bj2++;
    } else { run = 0; if (op === "a") out.push(A[ai++]); else out.push(B[bj2++]); }
  }
  out.push(...A.slice(bi), ...B.slice(bj));
  const warnings: string[] = [];
  if (longestRun < MIN_RUN) {
    warnings.push("No overlap found between these photos, so they were not merged. Add a photo that repeats a few ingredients from the other, or order them yourself.");
    return { segments: [...A, ...B], matched, overlapFound: false, warnings };
  }
  return { segments: out, matched, overlapFound: true, warnings };
}

export function mergePhotos(photos: MSegment[][]): MergeResult {
  let acc = photos[0] ?? [], matched = 0, ok = photos.length < 2;
  const warnings: string[] = [];
  for (let k = 1; k < photos.length; k++) {
    const r = mergeTwo(acc, photos[k]);
    acc = r.segments; matched += r.matched; ok = r.overlapFound; warnings.push(...r.warnings);
  }
  return { segments: acc, matched, overlapFound: ok, warnings };
}

export const segmentsToText = (s: MSegment[]) => s.map((x) => x.text).join(", ");
