// Merges the overlapping photo pairs from stored OCR output and writes the merged text next to the per-photo results.
// Usage: npx tsx scripts/ocr_eval.ts v19_pipeline_v2 && npx tsx scripts/merge_eval.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mergePhotos, segmentsFromLines, segmentsToText } from "../lib/ocr/merge";

const V = "v19_pipeline_v2", dir = "backend/fixtures/photos/_ocr";
const load = (id: string) => {
  const o = JSON.parse(readFileSync(`${dir}/${V}/${id}.json`, "utf8")) as { lines: [string, number][][] };
  return segmentsFromLines(o.lines.map((l) => ({ words: l.map(([text, confidence]) => ({ text, confidence })) })), id);
};
mkdirSync(`${dir}/${V}`, { recursive: true });
for (const [target, a, b] of [["merged_g", "pair_g_a", "pair_g_b"], ["merged_sh", "pair_sh_a", "pair_sh_b"]]) {
  const r = mergePhotos([load(a), load(b)]);
  console.log(`\n${target}: matched ${r.matched} segments, overlapFound=${r.overlapFound}, ${r.segments.length} segments`);
  for (const s of r.segments) console.log(`  [${s.sources.join("+")}${s.conflict ? " conflict" : ""}] conf ${s.conf.toFixed(0)}  ${s.text}`);
  writeFileSync(`${dir}/${V}/${target}.json`, JSON.stringify({ text: segmentsToText(r.segments), meanConfidence: 0, ms: 0, lines: [] }));
}

// Negative controls: photos of DIFFERENT products must not be merged (they share common ingredients such as Dimethicone).
const neg = mergePhotos([load("pair_g_a"), load("pair_sh_b")]);
console.log(`\nNEGATIVE CONTROL lotion(A) + shampoo(B): overlapFound=${neg.overlapFound} matched=${neg.matched}`);
const neg2 = mergePhotos([load("pair_g_a"), load("pair_g_b"), load("pair_sh_b")]);
console.log(`NEGATIVE CONTROL (lotion A+B) + shampoo(B): overlapFound=${neg2.overlapFound} matched=${neg2.matched}; warnings: ${neg2.warnings.length}`);
const pos = mergePhotos([load("pair_sh_a"), load("pair_sh_b")]);
console.log(`POSITIVE CONTROL shampoo A + B: overlapFound=${pos.overlapFound} matched=${pos.matched}`);
