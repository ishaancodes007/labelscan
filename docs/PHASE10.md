# Phase 10 report: reading hard real-life photos ("Try harder")

Problem reported: a real photo (curved bottle, blurry or squeezed text) cannot be read completely. This is the weakest part of the app, so this phase measured it and added one opt-in tool.

## What was tried first (and measured)
- **A different OCR engine.** RapidOCR (PaddleOCR models, ONNX) read almost nothing on your two screenshot crops (one stray number on the first, nothing on the second), far worse than Tesseract, even after padding and upscaling. So swapping the engine is not a free fix, and Tesseract stays.
- **Line-pitch analysis** of your curved crop showed the lines are evenly spaced (43-47 px across the width): the problem is horizontal squeeze at the bottle's edge, not perspective.
- **Stretching the left edge** and line-by-line reads recovered a few words and not the most squeezed ones.

## What was built
- **"Try harder (curved or blurry label)"** button on every photo, after a read. It reads the photo 11 ways in your browser (as is, and 10 guesses at the bottle's curve: `lib/ocr/unwarp.ts`), then `lib/ocr/consensus.ts` keeps the best reading of each ingredient. A name list (`data/inci_names.json`, names only, from the EU glossary; about 1 MB, 220 KB compressed, loaded only when you press the button) judges which reading looks like a real ingredient name.
- The text kept is always the **OCR'd raw text**, never the dictionary's spelling, so no identity is changed silently (names are still corrected only through the review panel when you accept a suggestion). Obvious camera junk at the start of a line (low-confidence words that look like no name) is trimmed; confident words are never trimmed.
- It runs **entirely in the browser**, so it also works on the Vercel site without the Python service. It took 4-6 seconds on your two crops. The check confirms only GET requests left the page (the photo is not uploaded).
- The tips text and a curved-bottle note from the last round remain: turning the bottle and adding a second photo is still the most reliable fix, because the app merges overlapping photos.

## Measured (exact commands; outputs saved)
`npx tsx scripts/ocr_consensus_eval.ts both` then `python scripts/ocr_consensus_report.py` (`docs/phase10_consensus_report.txt`). An ingredient counts as read when the resolver's name, or its top suggestion, equals the truth. Single read = the shipped pipeline; consensus = the new button.
| Set | Single read | Consensus | Precision single -> consensus |
|---|---|---|---|
| All 28 photos (388 truth ingredients) | 46.9% | **51.5%** | 77.8% -> 76.3% |
| 19 synthetic photos | 78.0% | **83.1%** | 75.8% -> 74.6% |
| 5 synthetic curved | 87.5% | 89.3% | 79.0% -> 75.8% |
| 9 real product photos | 20.9% | **25.1%** | 84.6% -> 81.5% |
- Best any single pass could do (an upper bound for this approach): 53.4% overall.
- On **your two screenshot crops** (`docs/phase10_e2e.txt`, `node scripts/e2e_phase10.cjs <photo> <words>`): the curved bottle list went from 10 of 13 expected words to 11; the misprinted label from 12 of 16 to 14. About one or two more ingredients each, not a transformation.
- The result is slightly longer (1.14 text pieces per true ingredient vs 1.03) and a little less precise, so there is a bit more to review.
- Regression: review panel 18/18, analyze-page 18/18, Phase 5 15/15, landing 20/20, accessibility scan clean, golden check 49/51 (2 documented deviations), mock agent guardrails all pass.

## Honest limits
- **The most squeezed words are still not read** (for example "Ethoxydiglycol", "Acetyl Glucosamine", "Sclerotium Gum" on the curved bottle; "AGUA" on the other crop). The "curve" corrections are guesses on a fixed grid, chosen mostly by testing on your first crop and my synthetic curved photos, so they may not suit every bottle and could be over-fitted.
- The real-photo set is 9 web-sized copies (small text); it is a weak stand-in for phone photos, and its ground truth was read by an AI model, not a person.
- The synthetic curved photos were produced by my own warp, which favours this method.
- Real fixes remain: even light, photos of the bottle turned left and right (merged by the app), and typing the few missing words. A cloud vision model would read better but needs an API key, costs money and sends the photo away; it is not built.
- Not done: highlighting low-confidence words on the photo for quick proofreading.
