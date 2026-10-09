# Phase 5 report: customer features

All of this runs in the browser against data saved in `localStorage`. The only server calls are the existing `/api/analyze` (ingredient text) and `/api/reference` (an Open Beauty Facts search word).

## What the user can do (verified in headless Chromium at phone width)
- **Save a product** from `/analyze` (name, type, morning/evening, optional MRP and volume; the price and volume are pre-read from the pack text when present). Only *identified* ingredients are used for checks; unconfirmed ones are kept separately and never treated as safe.
- **`/products`: routine checker** (2 to 6 saved products). Notes: active stacking (retinoid with benzoyl peroxide, with AHA, with another exfoliating acid), duplicate actives across products, morning/evening handling, and "no sunscreen marked in your morning routine" (shown only when product types are marked; otherwise it asks you to mark them). Each note has its source and confidence. Using two actives at different times of day downgrades the note to "different times".
- **`/compare`: dupe finder** (shared and unshared identified ingredients, notable actives each side, ₹ per ml from MRP and volume, editable). **Alternatives:** ingredient-level options from `data/substitutions.json`, and product-level options from Open Beauty Facts: candidates are identified by the resolver, any containing something on your avoid list are *left out and counted*, the rest are ranked by shared-ingredient overlap with attribution and trade-offs.
- **`/reactions`: reaction log**, behind a separate consent box (health-adjacent, device only). Pattern finder: when two or more logged products share an identified ingredient or curated family it says "These products share X. This may be worth discussing with a dermatologist; a patch test can help." It also lists unlogged products that contain the same ingredient. It never says you are allergic to anything.
- **`/report`: doctor-friendly report.** Tick the products and sections (routine and notes, full ingredient lists, skin type, avoid list, reaction log). It renders a print-styled page; "Print or save as PDF" uses the browser, so nothing is uploaded. There is no existing PDF service in this repo, so I did not use one.
- "Delete all my data" (profile page) removes products, reactions and the reaction consent too (checked: 0 keys left).

## Measured (exact commands and outputs saved in `docs/`)
- `npx tsx scripts/phase5_check.ts` -> `all pass` (21 expectations on the 7 illustrative sample products in `backend/fixtures/products/sample_products.json`). Output: `docs/phase5_check.txt`.
- `node scripts/e2e_phase5.cjs` (needs `npm i --no-save playwright-core`, app on :3100, Python service on :8000) -> 15 PASS, 0 FAIL, no console or page errors. Output: `docs/phase5_e2e.txt`. It covers analyze -> save -> routine -> dupes -> alternatives (live Open Beauty Facts) -> reactions -> report -> privacy -> delete.
- Live Open Beauty Facts run (search "moisturizer", 12 results): 5 had no ingredient list; with an avoid-list entry for glycerin, 6 were left out, 1 had too few shared ingredients to compare. Open Beauty Facts coverage varies, so these numbers are from one query and say nothing general.
- `python scripts/golden_check.py` unchanged: 49/51 pass, 2 documented deviations, 0 fail, 0 pending.

## What came from which data
| Feature | Data | Origin |
|---|---|---|
| Stacking notes, sun-sensitivity notes, active classes | `data/actives.json` | Curated; DermNet (acne topical therapy), FDA (AHAs), British Skin Foundation (seen via search summary only) |
| Ingredient-level alternative (retinol -> bakuchiol) | `data/substitutions.json` | One verified source: Dhaliwal et al., Br J Dermatol 2019 |
| Product-level candidates, names, ingredient text | Open Beauty Facts via `/api/reference` | Crowd-sourced, ODbL, attributed in the UI |
| Ingredient identities for candidates and your products | Python resolver | EU glossary dictionary |
| Allergen families in reaction patterns | `data/allergen_families.json` | Regulation 1223/2009 annexes |
| Sample products | `backend/fixtures/products/` | Written by me; illustrative, not real products |

## Privacy
Products, routine, reaction log, report choices, avoid list and consent are only in `localStorage` (`beautylens.*`, try/catch). The e2e check confirms every POST body is `{"text": ...}` (ingredient text for matching); no product list, reaction, profile or report data is sent. The reaction log needs its own consent tick. Logs on the server record counts and timings only.

## Deviations and limits (please read)
- **No "function-profile similarity".** The spec asks for it, but per-ingredient function data (CosIng) is still not loaded. Similarity is overlap of *identified ingredients* plus notable-active classes, and the UI says so. When function data exists this should be redone.
- **Substitution data is thin: one entry.** Surfactant, preservative and fragrance swaps had no independent source, only supplier pages; they are in `data/curation/TODO.md`. The UI says a missing substitution is a data gap, not a finding.
- **Actives coverage is small:** retinoids, AHAs, salicylic acid, benzoyl peroxide, plus vitamin C identified with no stacking rule (sources found were consumer press). Stacking sources disagree in places (fixed retinoid + benzoyl peroxide products exist); the note says so. Confidence is `limited`, and the British Skin Foundation page was only seen through search summaries.
- Sunscreen detection relies on the type the user marks. Nothing infers it.
- Product alternatives depend on the resolver recognizing the candidate's list; unidentified items lower reliability and are shown as a count. Resolution of up to 12 candidates is done one request at a time and can take a while.
- The report's PDF is the browser's print-to-PDF, not a generated file.
- Unreviewed Hindi glossary and function data remain open items from Phase 4.
- In this sandbox the Next.js server needed `NODE_USE_ENV_PROXY=1` to reach Open Beauty Facts through the egress proxy. That is an environment detail, not an app change.
