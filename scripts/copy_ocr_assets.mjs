// Copies the Tesseract.js worker, wasm core and English model into public/tesseract so the browser loads them from
// THIS origin (no CDN request, nothing about the photo or the user leaves the device). Run automatically before dev/build.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
const out = "public/tesseract";
mkdirSync(out, { recursive: true });
cpSync("node_modules/tesseract.js/dist/worker.min.js", `${out}/worker.min.js`);
for (const f of readdirSync("node_modules/tesseract.js-core")) if (/^tesseract-core.*lstm.*\.(js|wasm)$/.test(f)) cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`);
cpSync("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", `${out}/eng.traineddata.gz`);
// English word list for the printed-misspelling check (loaded lazily in the browser only when front-of-pack text exists)
mkdirSync("public/words", { recursive: true });
cpSync("node_modules/word-list/words.txt", "public/words/en.txt");
// Ingredient-name list (names only, from the EU glossary of common ingredient names): lets "Try harder" judge which OCR reading looks like a real name, in the browser
mkdirSync("public/lexicon", { recursive: true });
cpSync("data/inci_names.json", "public/lexicon/names.json");
console.log("OCR assets, word list and name list copied to public/");
