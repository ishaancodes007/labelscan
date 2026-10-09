// Manufacturing / expiry date and PAO extraction. EU rule (Regulation (EC) No 1223/2009, Art. 19(1)(d)): a date of minimum durability is shown as
// "month and year or day, month and year, in that order"; products lasting more than 30 months show a period-after-opening (PAO) symbol instead.
export type DateKind = "mfg" | "expiry";
export interface DateFind {
  kind: DateKind; raw: string; day?: number; month?: number; year?: number; format: "MM/YY" | "MM/YYYY" | "DD/MM/YY" | "DD/MM/YYYY" | "MON YYYY";
  confidence: "typed" | "high" | "low"; needsConfirm: boolean; note?: string;
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const LABEL = /\b(mfg|mfd|manufactur\w*|manuf|date of manufacture|exp(?:iry|ires|\.)?|use\s+before|use\s+by|best\s+before|bb)\b\.?\s*(?:date)?\s*[:\-]?/i;
const LOW = /occlud|low confidence|unclear|smudg|faint|illegible|partially|\?/i;
const yr = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

/** `lowConfidence`: true when the OCR confidence of the digits was low (or unknown for OCR text); typed text is trusted. */
export function findDates(text: string, opt: { typed?: boolean; lowConfidence?: boolean } = {}): DateFind[] {
  const out: DateFind[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = LABEL.exec(line); if (!m) continue;
    const kind: DateKind = /^(mfg|mfd|manuf|date of manufacture)/i.test(m[1]) ? "mfg" : "expiry";
    const rest = line.slice(m.index + m[0].length);
    let f: DateFind | null = null;
    const three = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})(?!\d)/.exec(rest), two = /(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})(?!\d)/.exec(rest);
    const mon = new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\.?\\s*[-'/]?\\s*(\\d{4}|\\d{2})\\b`, "i").exec(rest);
    const mk = (r: string, p: Partial<DateFind>): DateFind => {
      const low = LOW.test(rest) || (!opt.typed && !!opt.lowConfidence);
      return { kind, raw: r, ...p, format: p.format!, confidence: opt.typed ? "typed" : low ? "low" : "high", needsConfirm: !opt.typed && low } as DateFind;
    };
    if (three && Number(three[2]) <= 12 && Number(three[1]) <= 31) f = mk(three[0], { day: Number(three[1]), month: Number(three[2]), year: yr(three[3]), format: three[3].length === 2 ? "DD/MM/YY" : "DD/MM/YYYY" });
    else if (three && Number(three[1]) <= 12 && Number(three[2]) <= 31) f = { ...mk(three[0], { month: Number(three[1]), day: Number(three[2]), year: yr(three[3]), format: "DD/MM/YY" }), note: "The order of day and month is unclear (the EU order is day, month, year); please confirm.", needsConfirm: true };
    else if (two && Number(two[1]) >= 1 && Number(two[1]) <= 12) f = mk(two[0], { month: Number(two[1]), year: yr(two[2]), format: two[2].length === 2 ? "MM/YY" : "MM/YYYY" });
    else if (mon) f = mk(mon[0], { month: MONTHS.indexOf(mon[1].toLowerCase()) + 1, year: yr(mon[2]), format: "MON YYYY" });
    if (f) out.push(f);
  }
  return out;
}

export interface DateStatus { text: string; passed: boolean | null }
/** End of the stated month is the last day it is valid (month-year dates). `today` is injectable for testing. */
export function dateStatus(d: DateFind, today = new Date()): DateStatus {
  if (!d.year || !d.month) return { text: "", passed: null };
  const end = d.day ? new Date(d.year, d.month - 1, d.day, 23, 59, 59) : new Date(d.year, d.month, 0, 23, 59, 59);
  const passed = end.getTime() < today.getTime();
  if (d.kind === "mfg") return { text: `Made ${d.month}/${d.year}.`, passed: null };
  if (d.needsConfirm) return { text: `Read as ${d.month}/${d.year}, but we are not sure of the digits. Please check the pack and confirm.`, passed: null };
  return { text: passed ? `This date (${d.month}/${d.year}) has passed. Check the pack before using the product.` : `Valid until the end of ${d.month}/${d.year}.`, passed };
}

export interface PaoFind { months: number; raw: string }
const PAO_SET = [3, 6, 9, 12, 18, 24, 30, 36];
export function findPao(text: string): PaoFind | null {
  const m = /(?:\bPAO\b[^0-9]{0,12})?\b(\d{1,2})\s?(?:M|months?)\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return PAO_SET.includes(n) && (/PAO|months?/i.test(m[0]) || /\b\d{1,2}M\b/.test(m[0])) ? { months: n, raw: m[0].trim() } : null;
}
export function addMonths(d: Date, n: number): Date { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
