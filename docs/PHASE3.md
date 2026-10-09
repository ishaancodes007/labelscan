# Phase 3 report: rules, avoid list and profile

## What the user can now do (end to end, verified in headless Chromium at phone width)
- `/profile`: set skin type, concerns, pregnancy / breastfeeding / baby-or-child mode; build an **avoid list** by typing one name and choosing what to add (just that ingredient with its other names, and/or a whole curated family, each with its source and confidence); mark each entry **doctor-confirmed (hard rule, "Avoid")** or **personal preference (soft rule, "Caution")**; enter **patch-test results** (a reaction becomes an avoid entry); **"Delete all my data"** in one tap. Everything is in `localStorage` only (`beautylens.*`, wrapped in try/catch).
- `/analyze` results: a **quick-answer banner** ("Nothing on your avoid list was found among the identified ingredients." / "Contains N ingredients you avoid: …", plus "N items still need review"), a **deterministic summary**, per-ingredient **evidence panels** (identity source, function, regulatory status, rules fired with tier + source + confidence, limitations), **Use this / Undo** buttons for suggestions, and **"Good to know" notes** that appear only when their trigger is present.
- Rules run **in the browser** (`lib/rules/`), so the profile and avoid list never reach a server: the browser test confirmed the `/api/analyze` request body contains only `text`.

## Golden-case expectations (`python scripts/golden_check.py`, output in `docs/phase3_golden_check.txt`)
**33 of 35 implemented expectations pass, 2 documented deviations (unchanged from Phase 1), 0 fail; 5 pending (Phase 4).** The 12 new Phase 3 checks all pass:
- Fatty alcohol: before the user accepts anything, the `DETRY ALCOHOL` suggestion shows that all candidates are fatty alcohols, "not drying alcohols"; once a fatty alcohol is accepted, the item gets the "not a drying alcohol" note.
- Fragrance-allergy profile (doctor-confirmed family + Parfum): benzyl alcohol gets **`caution`**, not `avoid`, with an explanation that it is a fragrance allergen but also commonly a preservative (source + `limited` confidence); no "contradiction" is raised. If the user lists **benzyl alcohol itself** as doctor-confirmed, the cap lifts to `avoid` ("relevant if specifically sensitised").
- Citric acid has no avoid-list findings; the banner never says "safe"; an empty profile gets "You have not set an avoid list yet" and no claims.
- The checks run the TypeScript engine on the Python resolver's real output and **simulate the user pressing "Use this" on every top suggestion** (suggestions are never assumed identified otherwise).

## What is curated, and its honest status
Files: `data/allergen_families.json`, `data/profile_rules.json`, `data/function_glossary.json` (English + Hindi), `data/notes.json`; unverified items are in `data/curation/TODO.md`.
**Verification limit:** the EU hosts could not be opened from the build environment, so every source was checked through **web-search summaries**, not the primary text. Each entry carries `last_verified` (2026-10-09) and `confidence`; please re-check the primary text before relying on any of it.

| Entry | Source(s) | Confidence |
|---|---|---|
| EU labelled fragrance allergens (23 long-standing Annex III entries, each name confirmed in EMA / European Commission tables); thresholds 0.001% leave-on / 0.01% rinse-off | Regulation (EU) 2023/1545 (EUR-Lex), EMA appendix, SCCS lay summary | established |
| The ~56 substances added by 2023/1545 | not included | in TODO |
| Benzyl alcohol role note | a 2023 Commission **draft** in a Council document ("for purposes other than inhibiting the development of microorganisms in the product"); final wording not confirmed | limited |
| Isothiazolinones (MI, MCI); MI banned in leave-on in the EU | Regulation (EU) 2016/1198 | established (BIT, mixture limits: TODO) |
| Formaldehyde releasers (DMDM hydantoin, imidazolidinyl urea, diazolidinyl urea, quaternium-15) | de Groot et al., Contact Dermatitis 2010 | established for membership; EU status not stated |
| Retinoids and pregnancy (rule tier `avoid`, precautionary wording) | EMA | limited (the EMA statement is about topical retinoids as a class; cosmetic retinol/esters follow from secondary sources) |
| Fatty alcohols are not drying alcohols | Paula's Choice ingredient dictionary (retailer; secondary) | limited: the Cosmetic Ingredient Review report was not retrieved |
| "Chemical ≠ harmful", "natural ≠ gentle" notes | Reg. 1223/2009 Art. 2 (secondary summaries); DermNet + Annex III | limited / established |
| 30 plain-language function terms (EN/HI) | CosIng function terms (my paraphrase, not CosIng text) | note; Hindi not reviewed by a native speaker |

**Left out (no verified source), so the app says so instead of guessing:** rules for breastfeeding, rosacea, eczema, sensitive skin, acne-prone skin and baby/child; a silicone myth note; parabens/sulfates/silicones families. Ticking those on the profile page is saved but shows "No sourced rules exist yet for: …".

## Deviations and decisions for you
1. **Per-ingredient function and the function-based product summary are not possible yet.** The seed dictionary has no CosIng functions, and inventing them would violate rule 7. The evidence panel says "CosIng function data is not loaded" and the summary is built only from listing facts and curated families (and says a function description will come with the CosIng import). This blocks on getting the CosIng file.
2. **Only one pregnancy rule exists (retinoids)**, with `limited` confidence; breastfeeding has none.
3. Doctor-confirmed = "Avoid" and preference = "Caution" are my mapping of your "hard vs soft" wording; the benzyl-alcohol cap is the only place the engine lowers a tier, and it says why.

## Privacy
Profile, avoid list and patch tests: `localStorage` only; one-tap delete verified (all `beautylens.*` keys gone, still empty after reload); the analyze request carries only text. No logging of profile data (the rules never touch the server).

## Known limitations
- Rules apply only to ingredients that resolved or were accepted; suggestions and unresolved items are listed as "need review" and are never matched (so a match can be missed until the user reviews). Accept/undo is session-only state (not saved).
- Avoid-list names are matched exactly (INCI name + the aliases in the curated data); a typed name we do not know matches only itself, and the UI says so. No fuzzy matching on the avoid list.
- English only; Hindi UI strings arrive in Phase 7 (the Hindi glossary exists but is not shown yet).
- 6 of the 9 real photos still cannot be read by local OCR (Phase 2), so the rules mostly see typed or clean-photo text.
