// Prints quality metrics for every photo fixture so the thresholds in lib/ocr/quality.ts can be checked/calibrated.
import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { assess, measureQuality } from "../lib/ocr/quality";

const dir = "backend/fixtures/photos";
const index = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as { id: string; file: string | null; degradations: string[] }[];
console.log("id".padEnd(18), "blur".padStart(8), "glareFrac".padStart(10), "glareBlob".padStart(10), "longSide".padStart(9), "textH".padStart(6), " prompts / degradations");
for (const p of index.filter((q) => q.file)) {
  const j = jpeg.decode(readFileSync(`${dir}/${p.id}.jpg`), { useTArray: true });
  const m = measureQuality({ data: new Uint8ClampedArray(j.data), width: j.width, height: j.height });
  const r = assess(m);
  console.log(p.id.padEnd(18), m.blur.toFixed(0).padStart(8), m.glareFraction.toFixed(4).padStart(10), m.glareBlob.toFixed(3).padStart(10),
    String(m.longSide).padStart(9), String(m.textHeightPx).padStart(6), " ", r.prompts.length, p.degradations.join("+"));
}
