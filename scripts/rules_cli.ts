// stdin: {"items":[...], "profile": Profile | undefined, "profileSpec": {...} | undefined, "accepted": {"3":"CETYL ALCOHOL"}}  ->  stdout: Evaluation JSON
import { readFileSync } from "node:fs";
import { evaluate } from "../lib/rules/engine";
import { buildProfile } from "../lib/rules/profile";
import { EMPTY_PROFILE } from "../lib/rules/types";
const input = JSON.parse(readFileSync(0, "utf8"));
const profile = input.profile ?? (input.profileSpec ? buildProfile(input.profileSpec) : EMPTY_PROFILE);
process.stdout.write(JSON.stringify(evaluate(input.items, profile, input.accepted ?? {})));
