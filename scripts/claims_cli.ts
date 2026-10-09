// stdin: {"items":[...], "accepted":{}, "frontText":"...", "frontWordConf": 90|null, "dateLines":["Mfg. Date 01/26", ...], "now":"2026-10-09", "typedDates":false}
// stdout: {"claims":[...], "dates":[...], "pao":..., "misspellings":{eligible,found,notify}}
import { readFileSync } from "node:fs";
import { checkClaims } from "../lib/claims/check";
import { extractClaims } from "../lib/claims/extract";
import { dateStatus, findDates, findPao } from "../lib/trust/dates";
import { findMisspellings, shouldNotify } from "../lib/trust/misspell";
const inp = JSON.parse(readFileSync(0, "utf8"));
const claims = checkClaims(extractClaims(inp.frontText ?? ""), inp.items, inp.accepted ?? {});
const now = new Date(inp.now ?? Date.now());
const dates = findDates((inp.dateLines ?? []).join("\n"), { typed: !!inp.typedDates }).map((d) => ({ ...d, status: dateStatus(d, now) }));
const dict = new Set(readFileSync("node_modules/word-list/words.txt", "utf8").split(/\r?\n/).filter(Boolean));
const words = (inp.frontText ?? "").split(/\s+/).map((t: string) => ({ text: t, confidence: inp.frontWordConf ?? undefined }));
const ms = findMisspellings(words, dict);
process.stdout.write(JSON.stringify({ claims, dates, pao: findPao((inp.dateLines ?? []).join(" ")), misspellings: { ...ms, notify: ms.eligible && shouldNotify(ms.found) } }));
