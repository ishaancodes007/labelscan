// Runs Tesseract.js (Node) over every photo fixture for each preprocessing/PSM variant and stores the text + word
// confidences under backend/fixtures/photos/_ocr/<variant>/<photo>.json. Score them with scripts/photo_report.py.
// Usage: npx tsx scripts/ocr_eval.ts [variantName ...]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { grayToRGBA, toGray, type Gray } from "../lib/ocr/image";
import { adaptiveThreshold, contrastStretch, crop, deskew, flattenIllumination, upscale } from "../lib/ocr/preprocess";
import { prepareForOcr } from "../lib/ocr/pipeline";
import { createOcrWorker, PSM, runOcr } from "../lib/ocr/engine";

type Variant = { pre: (g: Gray) => Gray; psm?: string; dpi?: number; useCrop?: boolean };
const id = (g: Gray) => g;
export const VARIANTS: Record<string, Variant> = {
  v0_raw_psm3: { pre: id },
  v1_contrast: { pre: (g) => contrastStretch(g) },
  v2_up2: { pre: (g) => upscale(g, 2) },
  v3_adaptive: { pre: (g) => adaptiveThreshold(g, 15, 0.12) },
  v4_flatten: { pre: (g) => flattenIllumination(g, 40) },
  v5_up2_contrast: { pre: (g) => contrastStretch(upscale(g, 2)) },
  v6_psm6: { pre: id, psm: PSM.SINGLE_BLOCK },
  v7_psm4: { pre: id, psm: PSM.SINGLE_COLUMN },
  v8_psm11: { pre: id, psm: PSM.SPARSE_TEXT },
  v9_dpi300: { pre: id, dpi: 300 },
  v10_flatten_up2: { pre: (g) => upscale(flattenIllumination(g, 40), 2) },
  v11_flatten_up2_adaptive: { pre: (g) => adaptiveThreshold(upscale(flattenIllumination(g, 40), 2), 25, 0.1) },
  v12_deskew: { pre: deskew },
  v13_deskew_adaptive: { pre: (g) => adaptiveThreshold(deskew(g), 15, 0.12) },
  v14_deskew_up2: { pre: (g) => upscale(deskew(g), 2) },
  v15_deskew_up2_contrast: { pre: (g) => contrastStretch(upscale(deskew(g), 2)) },
  v16_deskew_psm6: { pre: deskew, psm: PSM.SINGLE_BLOCK },
  v17_shipped_pipeline: { pre: (g) => prepareForOcr(g).image },
  // real-photo experiments: 'up' = upscale first (tiny label text), 'crop' = the user's crop of the ingredient list
  v19_pipeline_v2: { pre: (g) => prepareForOcr(g).image },
  r1_up2_shipped: { pre: (g) => prepareForOcr(upscale(g, 2)).image },
  r2_up3_shipped: { pre: (g) => prepareForOcr(upscale(g, 3)).image },
  r3_crop_raw: { pre: id, useCrop: true },
  r4_crop_shipped: { pre: (g) => prepareForOcr(g).image, useCrop: true },
  r5_crop_up2_shipped: { pre: (g) => prepareForOcr(upscale(g, 2)).image, useCrop: true },
  r6_crop_up3_shipped: { pre: (g) => prepareForOcr(upscale(g, 3)).image, useCrop: true },
  r7_crop_up3_contrast: { pre: (g) => prepareForOcr(contrastStretch(upscale(g, 3))).image, useCrop: true },
  r8_crop_up2_contrast: { pre: (g) => prepareForOcr(contrastStretch(upscale(g, 2))).image, useCrop: true },
};

function png(g: Gray): Buffer {
  const rgba = grayToRGBA(g), p = new PNG({ width: g.width, height: g.height });
  p.data = Buffer.from(rgba.data);
  return PNG.sync.write(p);
}

async function main() {
  const only = process.argv.slice(2);
  const names = only.length ? only : Object.keys(VARIANTS);
  const dir = process.env.PHOTO_DIR ?? "backend/fixtures/photos";
  const index = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as { id: string; file: string | null; crop?: { x: number; y: number; w: number; h: number } }[];
  const photos = index.filter((p) => p.file);
  const worker = await createOcrWorker({ langPath: "node_modules/@tesseract.js-data/eng/4.0.0_best_int" });
  for (const name of names) {
    const v = VARIANTS[name];
    mkdirSync(`${dir}/_ocr/${name}`, { recursive: true });
    let ms = 0;
    for (const p of photos) {
      const j = jpeg.decode(readFileSync(`${dir}/${p.file}`), { useTArray: true });
      let g0 = toGray({ data: new Uint8ClampedArray(j.data), width: j.width, height: j.height });
      if (v.useCrop && p.crop) g0 = crop(g0, { x: p.crop.x * g0.width, y: p.crop.y * g0.height, width: p.crop.w * g0.width, height: p.crop.h * g0.height });
      const g = v.pre(g0);
      const r = await runOcr(worker, png(g), { psm: v.psm, dpi: v.dpi });
      ms += r.ms;
      writeFileSync(`${dir}/_ocr/${name}/${p.id}.json`, JSON.stringify({ text: r.text, meanConfidence: r.meanConfidence, ms: r.ms, lines: r.lines.map((l) => l.words.map((w) => [w.text, Math.round(w.confidence)])) }));
    }
    console.log(`${name}: ${photos.length} photos, ${(ms / photos.length).toFixed(0)} ms/photo`);
  }
  await worker.terminate();
}
main().catch((e) => { console.error(e); process.exit(1); });
