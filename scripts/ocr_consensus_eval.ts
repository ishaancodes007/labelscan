// Measures single-pass OCR against the multi-pass consensus on every photo fixture (synthetic and real).
// Writes backend/fixtures/photos/_ocr/consensus/<set>__<id>.json; score with: python scripts/ocr_consensus_report.py
// Usage: npx tsx scripts/ocr_consensus_eval.ts [synthetic|real|both]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { grayToRGBA, resizeGray, toGray, type Gray } from "../lib/ocr/image";
import { crop } from "../lib/ocr/preprocess";
import { prepareForOcr } from "../lib/ocr/pipeline";
import { createOcrWorker, runOcr } from "../lib/ocr/engine";
import { segmentsFromLines, segmentsToText } from "../lib/ocr/merge";
import { buildLexicon } from "../lib/ocr/lexicon";
import { consensus } from "../lib/ocr/consensus";
import { VARIANTS, cylinderUnwarp } from "../lib/ocr/unwarp";

const png = (g: Gray) => { const r = grayToRGBA(g), p = new PNG({ width: g.width, height: g.height }); p.data = Buffer.from(r.data); return PNG.sync.write(p); };
const lex = buildLexicon(JSON.parse(readFileSync("data/inci_names.json", "utf8")));
(async () => {
  const which = process.argv[2] ?? "both";
  const sets = [which !== "real" && ["synthetic", "backend/fixtures/photos"], which !== "synthetic" && ["real", "backend/fixtures/photos/real"]].filter(Boolean) as [string, string][];
  const worker = await createOcrWorker({ langPath: "node_modules/@tesseract.js-data/eng/4.0.0_best_int" });
  mkdirSync("backend/fixtures/photos/_ocr/consensus", { recursive: true });
  for (const [set, dir] of sets) {
    const index = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as { id: string; file: string | null; crop?: { x: number; y: number; w: number; h: number } }[];
    for (const p of index.filter((x) => x.file)) {
      const j = jpeg.decode(readFileSync(`${dir}/${p.file}`), { useTArray: true });
      let g0 = toGray({ data: new Uint8ClampedArray(j.data), width: j.width, height: j.height });
      if (set === "real" && p.crop) g0 = crop(g0, { x: p.crop.x * g0.width, y: p.crop.y * g0.height, width: p.crop.w * g0.width, height: p.crop.h * g0.height });
      const passes: { id: string; segments: ReturnType<typeof segmentsFromLines> }[] = [], texts: Record<string, string> = {};
      const t0 = Date.now();
      const run = async (id: string, g: Gray) => { const r = await runOcr(worker, png(g)); texts[id] = r.text.replace(/\n+/g, " / ").trim(); passes.push({ id, segments: segmentsFromLines(r.lines.map((l) => ({ words: l.words.map((w) => ({ text: w.text, confidence: w.confidence })) })), id) }); };
      await run("ship", prepareForOcr(g0).image);
      for (const v of VARIANTS) { let g = g0; if (v.c !== undefined) g = cylinderUnwarp(g, v.c, v.rho!); g = resizeGray(g, Math.round(g.width * v.scale), Math.round(g.height * v.scale)); await run(v.id, g); }
      const c = consensus(passes, lex);
      const out = { id: p.id, set, ms: Date.now() - t0, texts, consensus: segmentsToText(c.items.map((i) => i.seg)), items: c.items.map((i) => ({ t: i.seg.text, votes: i.votes, looksLike: i.looksLike, sim: +i.sim.toFixed(2) })), dropped: c.dropped, base: c.base, from: c.items.map((i) => i.from) };
      writeFileSync(`backend/fixtures/photos/_ocr/consensus/${set}__${p.id}.json`, JSON.stringify(out));
      console.log(`${set} ${p.id}: ${c.items.length} items (${c.dropped} dropped) ${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }
  await worker.terminate();
})().catch((e) => { console.error(e); process.exit(1); });
