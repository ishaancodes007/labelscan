// Phase 0: run the baseline pipeline on every fixture and classify each unresolved token.
// Usage: npx tsx scripts/phase0_baseline.ts [--no-pubchem]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeBaseline, type BaselineItem } from "../lib/baseline";
import { norm } from "../lib/parse";

const DIR = "backend/fixtures/labels";
const usePubChem = !process.argv.includes("--no-pubchem");

interface Fixture {
  id: string; golden: boolean; raw_ingredients: string;
  expected: { raw: string; inci: string | null; category?: string }[];
  expected_removed?: { raw: string; reason: string }[];
}

const CAUSES = ["1_ocr_noise", "2_broken_merged", "3_wrong_tool", "4_leakage", "5_unknown"] as const;
type Cause = (typeof CAUSES)[number];

const ratio = (a: string, b: string) => {
  // Levenshtein-based similarity
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n, 1);
};

function causes(item: BaselineItem, fx: Fixture): Cause[] {
  const raw = item.raw, n = norm(raw), out: Cause[] = [];
  const expRaws = fx.expected.flatMap((e) => e.raw.split(" + ").map(norm));
  const leak = /\bFIL\d+|\bMRP\b|\bRS\.?\s*\d|\bB\.?NO\b|\bMFG\b|\bEXP\b|SHAKE WELL|MADE IN|NET WT|\d+\s?ML\b/i;
  const removedHit = (fx.expected_removed ?? []).some((r) => norm(r.raw) && n.includes(norm(r.raw)));
  if (leak.test(raw) || removedHit) out.push("4_leakage");
  const hits0 = expRaws.filter((e) => e.length > 5 && n.includes(e));
  const hits = hits0.filter((e) => !hits0.some((o) => o !== e && o.includes(e))); // drop substrings of longer hits
  if (/-\s+\S/.test(raw) || hits.length >= 2) out.push("2_broken_merged");
  else if (fx.expected.some((e) => e.raw.includes(" + ") && e.raw.split(" + ").some((p) => norm(p) === n))) out.push("2_broken_merged");
  const wrongTool =
    /\bCI\s?\d{5}\b/i.test(raw) || /\b(PARFUM|FRAGRANCE|AROMA)\b/i.test(raw) || /\+\/-|MAY CONTAIN/i.test(raw) ||
    /\/.*\//.test(raw) && /AQUA|WATER/i.test(raw) || /\(NANO\)/i.test(raw) ||
    /\b(EXTRACT|LEAF JUICE|SEED GUM|BUTTER)\b/i.test(raw) || /^[A-Z][a-z]+ [A-Z][a-z]+ (\([^)]*\) )?.*(Oil|Butter)$/.test(raw) ||
    /\b(POLYMER|CROSSPOLYMER|COPOLYMER)\b/i.test(raw);
  const expEntry = fx.expected.find((e) => norm(e.raw) === n);
  if (wrongTool || (expEntry && expEntry.inci === null && expEntry.category)) out.push("3_wrong_tool");
  if (out.length === 0 || out.every((c) => c === "4_leakage") ) {
    const best = Math.max(0, ...fx.expected.filter((e) => e.inci).map((e) => ratio(n, norm(e.inci!))));
    if (best >= 0.7 && best < 1) out.push("1_ocr_noise");
  }
  if (out.length === 0) out.push("5_unknown");
  return out;
}

const totals = { tokens: 0, resolved: 0, resolvedCorrect: 0, falseAccept: 0, expectedIngr: 0, expectedFound: 0 };
const primary: Record<string, number> = Object.fromEntries(CAUSES.map((c) => [c, 0]));
const anyCause: Record<string, number> = { ...primary };
const status: Record<string, number> = {};
const rows: string[] = [];

(async () => {
  console.log(`# Phase 0 baseline  (PubChem lookup: ${usePubChem ? "ON" : "OFF"})`);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) {
    const fx = JSON.parse(readFileSync(join(DIR, f), "utf8")) as Fixture;
    const t0 = Date.now();
    const items = await analyzeBaseline(fx.raw_ingredients, usePubChem);
    const ms = Date.now() - t0;
    const expInci = new Set(fx.expected.filter((e) => e.inci).map((e) => norm(e.inci!)));
    let res = 0, ok = 0, bad = 0;
    for (const it of items) {
      status[it.status] = (status[it.status] ?? 0) + 1;
      if (it.status === "inci_exact" || it.status === "pubchem_match") {
        res++;
        if (it.status === "inci_exact" && expInci.has(it.inci!)) ok++;
        else if (it.status === "inci_exact") { bad++; rows.push(`${fx.id.padEnd(34)} FALSE-ACCEPT?        (resolved to ${it.inci}, not in expected identities) ${JSON.stringify(it.raw)}`); }
      } else {
        const cs = causes(it, fx);
        primary[cs[0]]++; cs.forEach((c) => anyCause[c]++);
        rows.push(`${fx.id.padEnd(34)} ${it.status.padEnd(19)} ${cs.join("+").padEnd(34)} ${JSON.stringify(it.raw)}`);
      }
    }
    const found = [...expInci].filter((e) => items.some((i) => i.inci === e)).length;
    totals.tokens += items.length; totals.resolved += res; totals.resolvedCorrect += ok; totals.falseAccept += bad;
    totals.expectedIngr += fx.expected.length; totals.expectedFound += found;
    console.log(`${fx.id.padEnd(34)} tokens=${String(items.length).padStart(2)} (expected ${fx.expected.length}) resolved=${res} ms=${ms}`);
  }
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : "0.0") + "%";
  console.log("\n## Unresolved tokens");
  rows.forEach((r) => console.log(r));
  console.log("\n## Status counts", status);
  console.log("## Cause counts (primary cause, first label)", primary);
  console.log("## Cause counts (any label; tokens can have several)", anyCause);
  console.log("\n## Totals");
  console.log(`tokens=${totals.tokens}  resolved=${totals.resolved} (${pct(totals.resolved, totals.tokens)})  false-accept=${totals.falseAccept}`);
  console.log(`expected entries=${totals.expectedIngr}  correctly found by exact seed match=${totals.expectedFound} (${pct(totals.expectedFound, totals.expectedIngr)})`);
})();
