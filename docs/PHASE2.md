# Phase 2 report: capture and OCR quality

## What exists now
- `/analyze` (mobile-first page): add one or more photos (camera or file) → quality prompts → crop/rotate → **local** OCR (Tesseract.js, assets served from this origin, no CDN) → multi-photo merge → editable text → `POST /api/analyze` → simple result list. The proper review panel is Phase 7.
- `lib/ocr/`: `quality.ts` (blur, glare, low-res prompts), `preprocess.ts` (crop, rotate, deskew, adaptive threshold, flatten, upscale), `pipeline.ts` (the preprocessing that ships), `merge.ts` (sequence-alignment merge), `engine.ts` (Tesseract wrapper shared with the Node measurement scripts).
- Measurement tools: `scripts/make_photo_fixtures.py`, `scripts/ocr_eval.ts`, `scripts/photo_report.py`, `scripts/merge_eval.ts`, `scripts/merge_report.py`, `scripts/quality_metrics.ts`, plus two Playwright checks (`scripts/e2e_phase2_*.cjs`). Raw outputs: `docs/phase2_*.txt`.

## IMPORTANT: the photos are synthetic
No real label photos were available. `backend/fixtures/photos/` holds 19 **synthetic** images: ground-truth ingredient text rendered on a label-like background and degraded with a cylindrical bottle warp, blur, glare, noise, rotation and low resolution (seeded, repeatable). 3 of them (`bad_*`) are deliberately unreadable, to test the prompts. The results measure robustness to those degradations only, not real phone-camera performance, and the degradations (4 of 16 photos are rotated) were chosen by me. Real photos can be added to the same folder and to `index.json`.

## Before/after on the photo fixtures (16 readable photos, 178 expected entries; PubChem off; seed dictionary)
Command: `npx tsx scripts/ocr_eval.ts` then `python scripts/photo_report.py --exclude-bad` (full table in `docs/phase2_photo_report.txt`).

| Pipeline | OCR char. error | Identified at top-1 | Auto-resolved | False-accepts |
|---|---|---|---|---|
| **Before**: raw image, Tesseract default (PSM 3) | 11.0% | 86.0% | 79.2% | 10 |
| **After (shipped)**: auto-deskew, + adaptive threshold only when glare is detected | **3.1%** | **91.0%** | **84.8%** | **4** |
| Ceiling: perfect OCR text through the same resolver | 0% | 99.4% | 97.2% | 0 |

Paired per photo (`--compare`): the shipped pipeline is better on 5 photos and worse on none; net +9 entries identified.
Including the 3 unreadable `bad_*` photos: top-1 75.7% → 79.5%.

## What I tried, and what was kept
| Change | Result on fixtures | Kept? |
|---|---|---|
| Contrast stretch | CER 11.0 → 13.7% | no |
| Upscale ×2 | CER 12.6%, top-1 85.4% (no gain, slower) | no |
| Illumination flatten | CER 16.6% | no |
| `user_defined_dpi` = 300 | CER 11.5% (no change) | no |
| PSM 4 / PSM 11 | worse / much worse | no |
| PSM 6 (single block) | fixes rotated text but CER 11-28% on clean photos (treats the label band as text) | no |
| Adaptive threshold always | helps glare photos, slightly hurts clean ones | only when glare detected |
| **Auto-deskew** (skew estimated on the central half of the width) | CER 11.0 → 3.8% | **yes** |
| Server OCR (RapidOCR/ONNX, stretch goal) | installs and runs (~1 s/photo) but untuned scored worse than Tesseract.js (CER 18.8%, top-1 71.9%) | **not built** (no `/v1/ocr`, no consent flag) |

Plain PSM 3 collapses on slightly rotated text (3° rotation: CER 65%). Deskew detected the true angle on every synthetic photo (3°→3.0, 6°→6.0, 5°→4.7, 0°→0) but this was tuned on the same photos I report on (about 20 variants tried), so some of the gain is selection.

## Quality prompts
Prompts: blur ("Hold steady…"), glare ("Tilt the bottle to reduce glare, or rotate it and add another photo."), small text ("Move closer…"). Thresholds in `lib/ocr/quality.ts`, **set between the last readable and first unreadable synthetic example**:
- Blur: 99th-percentile Sobel gradient < 40 (readable down to 55, σ=5 blur = 26). The first metric I tried (Laplacian variance) did not separate them, and was replaced.
- Glare: share of 32px blocks that are mostly saturated > 0.10 (readable photos ≤ 0.03, unreadable 0.27).
- Small text: estimated text height < 8 px (9px reads perfectly, 6px does not), or image long side < 300 px.
In a real headless Chromium at phone width (`scripts/e2e_phase2_quality.cjs`) the prompts appeared on exactly `bad_blur`, `bad_glare` and `bad_lowres`, and the clean photo showed "looks readable". Each threshold rests on two or three examples; expect to retune on real photos.

## Multi-photo merge
`lib/ocr/merge.ts`: per-photo OCR → ingredient segments with word confidences → semi-global alignment → higher-confidence reading at conflicts (per word when the word counts match, else the clearer segment). Each segment records its photo(s) in the UI ("Where each ingredient came from").
Full-list recall (`python scripts/merge_report.py`): lotion 56% / 56% alone → **94%** merged (ceiling 100%); shampoo 62% / 54% → **100%**; 0 false-accepts after merging.
A bug found by a browser test: a photo of a *different* product was accepted as overlapping because the two share common ingredients (Dimethicone, Sodium Benzoate, Citric Acid). An overlap now has to be a contiguous run of ≥ 2 matching ingredients; otherwise the photos are listed one after the other with a "No overlap found" warning. Negative controls (lotion + shampoo) are rejected, positive controls merge. A real overlap of only one ingredient is also rejected (the safe direction).

## Privacy
Photos are decoded, preprocessed and OCR'd in the browser; the OCR worker, wasm core and English model are served from `/tesseract/` on this origin. The Playwright run made no external requests. Only the text in the box is sent to `/api/analyze` when the user presses Analyze. No server OCR exists, so there is no server-OCR consent flag.

## Known limitations
- Synthetic photos only (see above); no phone-camera, motion-blur, lens-distortion or real-glare testing. Curved text is only mildly warped in the fixtures and deskew assumes straight lines.
- Hand-set quality thresholds; only English text; Tesseract's own errors on glare remain (the glare photos still score 6-16% CER).
- Manual crop is by four sliders, not by dragging a box; fine rotation by slider. The result list is a placeholder for the Phase 7 review panel.
- `public/tesseract/` (23 MB) is generated by `npm run ocr:assets` (runs before `dev`/`build`) and is git-ignored.
