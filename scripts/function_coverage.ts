// How many of the ingredients in the label fixtures have a sourced role in data/ingredient_functions.json. Run: npx tsx scripts/function_coverage.ts
import fs from "node:fs";
import { FUNCTION_COVERAGE, rolesFor } from "../lib/functions/data";
const files = fs.readdirSync("backend/fixtures/labels").filter((f) => f.endsWith(".json"));
let total = 0, withRole = 0; const missing = new Map<string, number>(); const perLabel: string[] = [];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(`backend/fixtures/labels/${f}`, "utf8"));
  let t = 0, w = 0;
  for (const e of d.expected as { inci?: string | null }[]) { if (!e.inci) continue; t++; if (rolesFor(e.inci)) w++; else missing.set(e.inci, (missing.get(e.inci) ?? 0) + 1); }
  total += t; withRole += w; perLabel.push(`${f.replace(".json", "").padEnd(44)} ${w}/${t}`);
}
console.log(`ingredients with a sourced role in data: ${FUNCTION_COVERAGE}`);
console.log(perLabel.join("\n"));
console.log(`\nfixture ingredients (identified entries only): ${withRole}/${total} have a role (${((100 * withRole) / total).toFixed(1)}%)`);
console.log("no role yet:", [...missing.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}${c > 1 ? ` x${c}` : ""}`).join(", "));
