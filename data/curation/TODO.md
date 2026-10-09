# Curation TODO: entries left out because they could not be verified

Rule 7: curated data must cite real sources; anything unverified is listed here instead of being guessed.
Sources used so far were checked through web-search summaries (the EU hosts could not be opened from the build environment), so every entry in `data/*.json` should be re-checked against the primary text. `last_verified` = 2026-10-09.

## allergen_families.json
- [ ] Add the substances added to Annex III by Regulation (EU) 2023/1545 (about 56 new entries; consolidated Annex III on EUR-Lex). Entry counts differ between secondary sources, so none is stated.
- [ ] Hydroxyisohexyl 3-cyclohexene carboxaldehyde (HICC/Lyral; reported banned from 2021) and methyl 2-octynoate: confirmed as historic list entries but left out pending the current Annex III text.
- [ ] Benzisothiazolinone (BIT) and the MCI/MI mixture limits (Annex V): not verified.
- [ ] Bronopol (formaldehyde releaser per de Groot) and the EU status of each releaser: not verified.
- [ ] Parabens, sulfates, silicones families (needed for the Phase 4 "free-from" claim checks): need a source for membership.
- [ ] Replace the secondary source for fatty alcohols with the Cosmetic Ingredient Review report on cetyl/stearyl/cetearyl alcohols; confirm the claim "not drying".
- [ ] Confirm that https://eur-lex.europa.eu/eli/reg/2009/1223/oj resolves (standard ELI form; not opened from the build environment).
- [ ] Benzyl alcohol: confirm the FINAL adopted Annex III wording ("for purposes other than inhibiting the development of microorganisms in the product" comes from a 2023 Commission DRAFT in a Council document) and its Annex V preservative limit.

## profile_rules.json (no rule shipped until a source is verified)
- [ ] breastfeeding: only secondary, weak statements found.
- [ ] rosacea / eczema / sensitive skin: no authoritative source verified (e.g. which preservatives or alcohols to flag).
- [ ] acne-prone: comedogenicity ratings are contested; do not invent.
- [ ] baby / child: nothing verified.
- [ ] pregnancy: only retinoids are covered. Salicylic acid, high-dose vitamin A, some UV filters etc. need sources (one secondary source says low-dose salicylic acid and benzoyl peroxide are considered acceptable; unverified).

## notes.json
- [ ] Silicone myth note: no source verified.
- [ ] Chemical-is-not-harmful note rests on the definition of "substance" in Reg. 1223/2009 Art. 2, confirmed only through secondary summaries.

## function_glossary.json
- [ ] Hindi wording has not been reviewed by a native speaker (`hindi_reviewed: false`).
- [ ] Per-ingredient functions are not in the repo: they require the CosIng import (the official CosIng data hosts were unreachable). Until then the app says "function data not loaded" and does not guess.
