// Copies the Tesseract.js worker, wasm core and English model into public/tesseract so the browser loads them from
// THIS origin (no CDN request, nothing about the photo or the user leaves the device). Run automatically before dev/build.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
const out = "public/tesseract";
mkdirSync(out, { recursive: true });
cpSync("node_modules/tesseract.js/dist/worker.min.js", `${out}/worker.min.js`);
for (const f of readdirSync("node_modules/tesseract.js-core")) if (/^tesseract-core.*lstm.*\.(js|wasm)$/.test(f)) cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`);
cpSync("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", `${out}/eng.traineddata.gz`);
console.log("OCR assets copied to", out);
