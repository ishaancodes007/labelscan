# Phase 9 report: roles first, and a livelier analyze page

Requested after testing the first label: most ingredients looked "not found", the page stressed what was *matched* rather than what each ingredient *does*, and the upload page felt static and colourless.

## What changed
- **Roles first.** Results now open with "What is in this product, and what each part is listed as doing": ingredients grouped by what they are listed as doing (Moisture, Softening, Texture, Cleansing, Freshness, Base, Sun, Scent, Colour, Skin and hair care), each group colour-coded, with a one-line plain-language meaning, a "role not in our data yet" group, and a "Still to confirm" lane for names not matched yet. Clicking a chip jumps to that ingredient.
- **Unmatched names stop dominating.** They sit in an amber "Still to confirm" lane, shown with the likely match as a marked guess ("GLYCERN → Glycerin?"). In the ingredient list, an unmatched row shows only a conditional role ("If this is Glycerin, it is listed as: Humectant…"); a name with no candidate shows no role at all. The match-confidence counts moved below the role view.
- **Ingredient rows** show role chips (first 4, "+N more"), the first role in plain words, a "what each role means" fold-out, and the source link. Wording for the new terms is in `data/function_glossary.json` (project paraphrase).
- **The analyze page.** A "lab notebook" look: gradient hero with a 3-step stepper, a dropzone (drag a photo in, choose photos, take a photo, or type instead; the camera and gallery are now separate inputs, so you can pick from the gallery on a phone), a scan frame with sweeping beam, corner brackets and a progress ring while a photo is read, a "Read N words" badge, text that "inks in" when new text arrives, ruled notebook paper in the text boxes, colour-coded match tiles, and staggered entrances.
- **Colour system** (`app/globals.css`, `app/analyze/analyze.css`): OKLCH palette. Status colours: green identified, amber needs your check, violet ambiguous, rust not matched, slate lookup unavailable. Role families are spaced around the colour wheel. Meaning always has words or an icon as well; colour is never the only signal. Light and dark modes are both tuned.
- **Motion** uses transform/opacity and stops under the Reduce motion toggle and the system setting.

## Where the roles come from (read this)
`data/ingredient_functions.json` has **175 ingredients**. The official CosIng database has no bulk download and its search service was not reachable from here, so I could not load it. Instead the roles were researched through web-search results for Cosmetics Europe's COSMILE database, CosIng-mirroring pages and similar references, using parallel research agents. **No page was opened**: each entry rests on search-result text for a URL that appeared in the results. Consequences:
- Wording can differ from the official CosIng record (Cosmile says "fragrance" where CosIng says "perfuming"; I normalised a few such terms and dropped "fragrance functional").
- Some entries were read from translated pages; their notes say so.
- Entries with conflicting or garbled sources were left out (ALUMINUM HYDROXIDE, ALLANTOIN); 29 more names were not searched because the shared search budget ran out. All are in `data/curation/TODO.md`.
- Every entry is `limited` confidence, and the UI says "page not opened by BeautyLens" next to each source link. Please check against CosIng before relying on any of it.
- A role is **what an ingredient is listed as being used for**, not proof it does that here or at what amount.

## Measured
- `npx tsx scripts/function_coverage.ts`: on the 10 label fixtures 84/87 identified ingredients have a role, but I chose ingredients for the first round from those fixtures, so that number flatters the data. On the **9 real product labels** (ground truth read by an AI model, not human-verified), **before the targeted second round: 135/196 = 68.9%** of resolved ingredients had a role. After the second round: **167/196 = 85.2%, but that second list was chosen from those same labels, so it is in-sample**. 68.9% is the better guide for an unseen label. Also on those labels, 196 of 245 printed items resolved, so overall roughly 55% of printed items on an unseen real label (69% of 80%) would show a role. Output: `docs/phase9_function_coverage.txt`.
- `node scripts/e2e_phase9.cjs` -> 18 PASS, 0 FAIL, no console errors (`docs/phase9_e2e.txt`): dropzone and inputs, stepper, animation on by default, scan frame while reading, role overview before counts, Glycerin under Moisture and Cetyl Alcohol under Softening, unmatched names in "Still to confirm", conditional roles for unmatched rows, none for unknown names, source disclosure, chip jump, Reduce motion stops the animations.
- `node scripts/a11y_check.cjs` (axe-core, WCAG 2 A/AA, 5 pages, light and dark) -> no automated violations after fixing two contrast issues it found (`docs/phase9_a11y.txt`).
- Re-run: `e2e_phase7_review.cjs` 18 PASS (its wording check was updated for the simpler match explanation), `phase5_check.ts` all pass, `golden_check.py` 49/51 with 2 documented deviations.

## Limits and not done
- Roles exist for about 175 ingredients, not the ~30,000 in the dictionary; anything else shows no role rather than a guess.
- The Vercel site you deployed is a one-time copy and will not show any of this until it is reconnected to this repository (see `DEPLOY.md`, "Keeping the site up to date").
- Only the analyze page was redesigned; other pages got the new status colours and fonts but not the new layout.
- I judged the look from screenshots at desktop width in light and dark mode; I have not tested on a real phone.
