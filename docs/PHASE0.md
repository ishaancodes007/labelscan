# Phase 0 report: baseline and diagnosis

The repo was empty at the start of this session, so the "current pipeline" is a minimal baseline built here from the V3 "Current state" description.

## What is live, optional, sample or planned
| Item | State |
|---|---|
| Next.js 16.4 / React 19.3 / TS scaffold, `POST /api/analyze` (split on commas, exact match vs 130-name seed, PubChem name lookup) | live code |
| Seed INCI list (`lib/seedInci.ts`) | **sample**, hand-typed, placeholder for the CosIng SQLite dictionary |
| PubChem lookup | coded; **unreachable from this build environment** (egress policy), so every call returns `lookup_unavailable` |
| CosIng, Open Beauty Facts | not built; hosts are also blocked here (`ec.europa.eu`, `pubchem.ncbi.nlm.nih.gov`, `world.openbeautyfacts.org`) |
| Tesseract.js OCR UI, Claude paraphrase, Gemini PDF, Python backend, profile, claims, UI/landing, Hindi | not built (planned, later phases) |

## Fixtures (`backend/fixtures/labels/`)
- 1 golden case: verbatim from the spec.
- 9 reference lists: typed from memory, `verified: false`, **not** transcribed from physical packs. Only layout problems are reproduced (hyphenated line breaks, CI colorants, botanicals, Parfum, slash synonyms, trailing directions). No character-level OCR noise is simulated.

## Results
Commands: `npx tsx scripts/phase0_baseline.ts --no-pubchem` and `npx tsx scripts/phase0_baseline.ts`
(raw outputs: `docs/phase0_baseline_nopubchem.txt`, `docs/phase0_baseline.txt`).

- 110 tokens over 10 fixtures: 62 resolved (56.4%), 48 unresolved.
- Golden case alone: 1 of 17 tokens resolved.
- With PubChem on, the 48 unresolved tokens are `lookup_unavailable` (not "not found").

Primary-cause counts of the 48 unresolved tokens:

| Cause | Count |
|---|---|
| 1 OCR character noise | 10 (all golden) |
| 2 broken or merged tokens | 9 |
| 3 wrong tool (botanicals, CI, Parfum, slash synonyms, nano) | 18 |
| 4 non-ingredient leakage | 2 |
| 5 truly unknown or trade name | 9 |

## Caveats
- The 56.4% is inflated. I wrote the seed list while knowing the fixtures. It is a floor for tooling, not an estimate for real labels.
- Cause 5: 8 of 9 are valid INCI names absent from the seed (Zinc PCA, Isoceteth-20, Chlorphenesin, ...), so these are dictionary-coverage gaps rather than truly unknown names. The 9th, "PEG-10 Dimethicone", is also a valid name.
- Cause 4 counts 2 tokens because leakage glued to an ingredient is classified by its leakage content; "CITRIC ACO. FIL1746700" also has OCR noise.
- The classifier is heuristic and partly uses fixture expectations. The "false-accept" count of 4 is an artifact: all four are `PARFUM`, whose expected entry is a category, so the metric counted it wrong. There are no real false-accepts.
