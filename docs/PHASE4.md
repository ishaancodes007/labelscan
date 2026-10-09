# Phase 4 report: claims and trust signals

## What the user can do now (verified in headless Chromium, `node scripts/e2e_phase4.cjs`, 0 console errors)
- `/analyze` has an optional **"front of pack and dates"** step. Type the text, or set a photo's role (ingredient list / front of pack / dates) and read it locally. OCR word confidences are kept only while the box is unedited; typed text counts as typed.
- **Claims on the pack** (`data/claims.json`, `lib/claims/`): verdicts are *matches*, *consistent*, *contradiction*, *needs context* or *not verifiable from ingredients*, each with an explanation, sources and a confidence label.
  - Fragrance-free: Parfum gives a contradiction. Fragrance allergens or essential oils give needs context. Benzyl alcohol alongside other preservatives gives consistent, with the nuance explained. If ingredients are still unconfirmed, the verdict is **never** consistent ("14 ingredients are not confirmed yet").
  - Alcohol-free (fatty alcohols do not contradict), paraben / sulfate / silicone-free (family check), "with vitamin X / ingredient Y" (alias map).
  - Non-comedogenic, hypoallergenic, dermatologist tested, clinically proven, non-irritating: always *not verifiable*.
- **Print-quality soft notice**: shown only when several HIGH-confidence OCR words are misspellings of common words. Never fires on low-confidence OCR words or typed text. Wording is a neutral prompt to check the pack, never an accusation.
- **Expiry / PAO**: mfg and expiry dates are extracted with a confidence label. Low-confidence reads ask the user to confirm. The PAO symbol (e.g. "12M") is explained. An optional "opened on" date is stored in `localStorage` (`beautylens.opened.v1`) with in-app reminder text.
- **Reference formula** (Open Beauty Facts via `/api/reference`): information only; ODbL, crowd-sourced, labelled as such.
- **Regulatory status** in evidence panels now comes from primary-source data (`data/regulation_1223_annexes.json`, derived from the consolidated Regulation 1223/2009 text fetched from the Publications Office Cellar by `scripts/fetch_regulation.py`). The allergen families (`data/allergen_families.json` v2) were rebuilt from it by `scripts/curate_families.py` (the Phase 3 list used secondary sources).

## Measured (exact commands; PubChem off, real 30k EU glossary dictionary)
- `python scripts/golden_check.py` -> `49/51 implemented expectations pass, 2 documented deviation(s), 0 fail; 0 pending (later phases). PubChem: off.` (`docs/phase4_golden_check.txt`). The 2 deviations are SODILN BENDATE and BENEYL ALCOHOL (unchanged, documented in `docs/PHASE1.md`).
- `resolution_report.py` on fixtures (raw outputs `docs/phase4_report_*_glossary*.txt`): baseline exact match 77.3% resolved; resolver 86.4% auto-resolved (95/110) plus 13.6% suggested; mean latency 66 ms.
- Noise run (`--noise 5 --seed 1`, 580 entries): 211 high-confidence suggestions, 0 wrong; 6 top-1 suggestions wrong overall.
- Threshold sweep, 144 settings (`docs/phase4_threshold_sweep_glossary.txt`): 0 wrong high-confidence in all, so synthetic noise **cannot separate** the thresholds. They were chosen using held-out real OCR text instead.
- Browser check: with the raw OCR list, claims honestly read *needs context* (14 items unconfirmed). With the corrected list, vitamin E/B3/B5/avocado oil -> *matches*, "no added fragrance" -> *consistent* (benzyl alcohol nuance), "won't clog pores / non-irritating / clinically tested" -> *not verifiable*; expiry 04/29 asks for confirmation.
- Real-photo CER / top-1 (Phase 2) were measured with the seed dictionary and **not re-measured** with the glossary dictionary.
- Real-product claim spot checks run ad hoc, not in the golden check: Nivea "fragrance free" -> contradiction (Parfum); Garnier "sulfate free" -> contradiction (Sodium Laureth Sulfate).

## Dictionary change this phase
Identity dictionary is now the ~30k-name EU glossary of common ingredient names (Implementing Decision (EU) 2025/1175), which carries no functions or CAS numbers. Common-name aliases from the curated seed override same-named glossary entries (WATER vs AQUA). Speed work: cost-only pruned DP, long-fragment removal, merge/split caps (0.02-0.9 s on real OCR texts).

## Privacy
No new data leaves the browser: claim and date checks run client-side. The only new server call is `/api/reference` (product name/brand lookup against Open Beauty Facts; ingredient lists are not sent). The "opened on" date is local; "Delete all my data" covers it.

## Known limitations
- Reference comparison is info-only; the overlap at which a difference would suggest counterfeit packaging is uncalibrated, so there is no trigger on it (TODO).
- The misspelling hint needs OCR confidences; the golden fixture check assumes 90. It has not been tested on real front-of-pack photos.
- "No essential oils" is detected but cannot be checked (no verified list). "Unscented" is deliberately not treated as fragrance-free.
- Plant-oil aliases rest on standard botanical names (confidence `limited`).
- Per-ingredient function data is still not available (CosIng not reachable); the Hindi glossary is unreviewed.
- Annex II is only partly loaded (49 entries identifiable by INCI name).
- `eur-lex.europa.eu` is blocked from this environment; the Cellar was used instead. Everything unverified is in `data/curation/TODO.md`.

## Files
`lib/claims/*`, `lib/trust/*`, `lib/rules/regulatory.ts`, `app/analyze/TrustPanel.tsx`, `app/api/reference/route.ts`, `data/claims.json`, `data/regulation_1223_annexes.json`, `data/allergen_families.json`, `scripts/{fetch_regulation,curate_families}.py`, `scripts/{claims_cli.ts,e2e_phase4.cjs}`, edits to `golden_check.py` and the analyze UI.
