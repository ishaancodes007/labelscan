# Phase 2 report: capture and OCR quality

## What exists now
- `/analyze` (mobile-first page): add one or more photos (camera or file) → quality prompts → crop/rotate → **local** OCR (Tesseract.js, assets served from this origin, no CDN) → readability check on the OCR result → multi-photo merge → editable text → `POST /api/analyze` → simple result list (the proper review panel is Phase 7).
- `lib/ocr/`: `quality.ts` (pre-OCR prompts and the post-OCR check), `preprocess.ts` (crop, rotate, deskew, optional thresholds), `pipeline.ts` (the preprocessing that ships), `merge.ts` (sequence-alignment merge), `engine.ts` (Tesseract wrapper shared with the Node scripts).
- Measurement tools: `scripts/make_photo_fixtures.py` (synthetic), `scripts/make_real_index.py` (real), `scripts/ocr_eval.ts`, `scripts/photo_report.py`, `scripts/merge_eval.ts`, `scripts/merge_report.py`, `scripts/quality_metrics.ts`, two Playwright checks (`scripts/e2e_phase2_*.cjs`). `PHOTO_DIR=backend/fixtures/photos/real` switches the tools to the real set. Raw outputs: `docs/phase2_*.txt`.

## Two photo sets, and why the real one matters most
1. **Synthetic** (`backend/fixtures/photos/`, 19 images): ground-truth text rendered on a label and degraded (bottle warp, blur, glare, noise, rotation, low resolution), seeded and repeatable. They test robustness to those degradations only.
2. **Real** (`backend/fixtures/photos/real/`, 5 photos supplied by the project owner; 4 more were announced but have not arrived): Cetaphil lotion, Minimalist vitamin C serum, Nivea body lotion, Garnier shampoo, and an Indian-market label crop. **Their ground-truth ingredient text was read from the photos by an AI model and is not human-verified** (`truth_verified: false`); please check `scripts/make_real_index.py`. The images look like web-sized copies (500-1600 px, one with a platform watermark, one showing a person's hand), not original phone photos, so they under-represent phone resolution. The ingredient-list crop rectangles are my own guesses.

## Headline: tuning on synthetic photos overfitted. The real photos exposed it.
The Phase 2 pipeline I first shipped (deskew + adaptive threshold when "glare" is detected) scored **24.0% top-1 on the real photos against 47.9% for doing nothing**. Causes found and fixed:
- A white label background (66% saturated pixels) was read as glare, which switched on the adaptive threshold and cut the Indian label from 30/32 to 11/32 identified ingredients. The same label also got a false "glare" prompt.
- The "small text" estimator returned 723 px of text height on a real photo (meaningless); it missed the 7 px ingredient line on the Cetaphil photo.
- Skew detection assumed dark text. (On the actual crops the estimated skew was within ±0.5° for all five, so rotation was never the real-photo problem.)

## Current pipeline (v19): what is kept and why
Crop and rotate by the user → automatic deskew **only for angles ≥ 1°** → Tesseract default page segmentation. Nothing else: the adaptive threshold is opt-in only.

| Set | Raw image (baseline) | Current pipeline v19 | Ceiling (perfect text) |
|---|---|---|---|
| **Real, 5 photos**: top-1 identified / auto-resolved / false-accepts | 47.9% / 38.5% / 8 | **47.9% / 38.5% / 8** (identical: it does no harm) | not measured |
| Synthetic, 16 readable photos: OCR char. error | 11.0% | 3.8% | 0% |
| Synthetic: top-1 / auto / false-accepts | 86.0% / 79.2% / 10 | 89.9% / 84.3% / 4 | 99.4% / 97.2% / 0 |

- On the real photos **no variant beat the raw image** (Tesseract.js with upscaling ×2/×3, contrast, crops, flattening, adaptive, deskew all landed between 15% and 48%; see `docs/phase2_real_photo_report.txt`). Deskew's gain exists only on synthetic photos, where I rotated 4 of 16 on purpose.
- Removing the glare-triggered adaptive threshold costs about 1 point on synthetic photos (91.0% → 89.9%) and avoids a 24-point loss on real ones.
- Real-photo numbers are over only 5 photos and about 100 ingredients (73 counted: entries the seed dictionary can identify; the rest are dictionary gaps and are not counted as OCR misses).

### Where real photos actually fail
| Photo | What happens | Why |
|---|---|---|
| Indian label crop (flat, high contrast) | works: 30/32 identified | clean, large, uniform text |
| Minimalist serum | 8/12 on the full photo; cropping to the list cuts char. error from 179% to 31% | the full photo adds marketing and direction text; crop removes it |
| Nivea (white on blue, curved) | partial (3-7/13) | polarity and curvature; no rotation/inversion/PSM combination reliably helped (best 13 of 28 exact words) |
| Cetaphil (556 px wide) | nothing read from the ingredient line | text about 7 px tall |
| Garnier (Drug Facts panel) | nothing read | text about 10-12 px, blurry, low contrast |

**Neither OCR engine reads the last three.** RapidOCR (ONNX) also failed on them (char. error 77-95%; its word-recall figure is understated because it often drops spaces), so a server-OCR path was not built. The limiting factor looks like image resolution and text size, which the 4 incoming photos and original phone-resolution images would clarify.

## Quality prompts (honest status)
Before OCR (`lib/ocr/quality.ts`; thresholds set between the last readable and first unreadable example, so each rests on two or three images): blur (99th-percentile Sobel gradient < 40), glare (saturated blob 10-50% of the image and the page not white), tiny images (< 300 px or estimated text < 8 px). On the synthetic set they fire on exactly the three deliberately bad photos. **On real photos they fire on none**, including the two unreadable ones; a mostly-white label is explicitly not glare. The pre-OCR message therefore no longer says "looks readable"; it says no blur/glare/size problem was found and the text will be checked after reading.
After OCR (the part that works on real photos), in order: fewer than 8 words → "could not read much text"; fewer than 4 commas → "did not find an ingredient list"; low confidence (<60) or tiny words → "some words may be misread, check the text". In real Chromium this gave: Indian label no warning; Cetaphil and Garnier "did not find an ingredient list"; synthetic bad photos "could not read". Confidence alone could not separate a bad read from a good small-text crop (both 55), which is why the comma check decides.

## Multi-photo merge
`lib/ocr/merge.ts`: per-photo segments with word confidences → semi-global alignment → higher-confidence reading at conflicts → per-segment photo source shown in the UI. An overlap must be a **contiguous run of ≥ 2** matching ingredients (found by a browser test: a shampoo photo was first accepted as overlapping a lotion because they share Dimethicone, Sodium Benzoate, Citric Acid). Evaluated on synthetic pairs only (`python scripts/merge_report.py`): lotion 56% / 56% alone → 94% merged; shampoo 62% / 54% → 100%; negative controls (different products) rejected. Not tested on real overlapping photos.

## New resolver finding from real text (Phase 1 code changed)
Names correctly printed but missing from the 235-name seed dictionary were suggested as a *different real chemical*: Aluminum Hydroxide → Sodium Hydroxide, Tin Oxide → Zinc Oxide, Retinyl Propionate → Retinyl Palmitate. All were only `suggested` (never auto-resolved, never high-confidence), but they are misleading. A candidate now carries a warning ("a different ingredient word, not a misspelling: check the pack") when it differs by a whole word that is itself a valid dictionary word, and the UI shows it. **This catches Aluminum→Sodium but not Tin→Zinc or Retinyl** (those words are not in the seed vocabulary); it will be much stronger with the real CosIng dictionary. The golden check and the Phase 1 numbers are unchanged.

## Privacy
Unchanged: photos are decoded, processed and read in the browser (OCR worker, wasm and model served from `/tesseract/`); the real-photo browser run made no external requests; only the text in the box is sent to `/api/analyze`. **The committed real photos may carry third-party copyright/watermarks and one shows a person**: confirm the repository is private or remove them before making it public.

## Known limitations
- 5 real photos; AI-read ground truth; guessed crop rectangles; web-sized copies. Synthetic results do not predict real phone-camera performance (that is exactly what the real set showed).
- No local OCR configuration read the tiny/blurry ingredient lines; the app tells the user so and falls back to typing, instead of guessing.
- Manual crop is by sliders. English only. `public/tesseract/` (23 MB) is generated by `npm run ocr:assets` and git-ignored.
- Rows `v17_*` in the synthetic table elsewhere in `docs/` come from the first (adaptive-on-glare) pipeline; the current pipeline is `v19_pipeline_v2`.
