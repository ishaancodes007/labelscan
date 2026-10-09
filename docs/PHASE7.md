# Phase 7 report: review panel, landing page, polish

**Hindi toggle: not built, at your instruction.** The curated Hindi glossary stays unreviewed and unused; nothing in the UI mentions Hindi.

## What changed
- **`/analyze` identity summary:** one count per status (INCI name match, synonym, recognized class, PubChem record, accepted by you, kept as printed, suggested, ambiguous, not found, lookup unavailable) plus a sentence that shows the sum equals the total. `needsReview = suggested + ambiguous + not found + lookup unavailable`. Only resolved identities and your own acceptances use green; every unresolved status has its own colour.
- **Review panel** (`ReviewPanel.tsx`): one card per item needing review with the raw token, OCR confidence (or "not available"), up to 3 candidates (each with source link, a why-it-matched note, and an "AI suggestion" badge where applicable) and the actions **Use this · Keep as typed · Edit text · Not an ingredient · Split merge**. **Accept all high-confidence suggestions** first lists every item it will accept and applies only after you confirm.
- Edit text and Split merge **re-run the analysis** on the rebuilt list; the old result is cleared first so nothing stale stays on screen. Choices are keyed by the printed text, so earlier choices survive a re-run. They live in React state only, never in storage, and "Undo all my choices" clears them.
- **Removed fragments** disclosure with **Restore** (a restored fragment is added back unchecked, never treated as safe).
- **Provider status line:** Enhanced recognition on / unavailable · AI helper off / on / unavailable / rate-limited · OCR local.
- **Landing page `/`** (server-rendered): warm ivory and forest green, serif headings; entrance of about 1.6 s (light leak, paper grain, botanical sprig drawing in, headline revealed line by line, subhead and CTA fading up, a scan beam turning words on an illustrative generic label into tag chips); scroll sections revealed once (How it works, privacy diagram, matching ladder, features); hover-lift CTAs, underline-draw links, card tilt of at most 4 degrees on pointer devices only. Every CTA works (`/analyze`, `/about`). New `/about` page.
- **Reduced motion:** the system setting is honoured and there is an on-page **Reduce motion** toggle (in the nav on every page), saved in `localStorage` with try/catch and applied before first paint. Reduced means final states with at most a 0.2 s fade.
- Small backend addition: `noMerge` on the resolve request so "Split merge" keeps fragments apart instead of being merged back.
- Fixed along the way: results labelled glossary matches as "starter list" (it used the dictionary-wide source rather than the per-item one); AI candidates could be cut off by three deterministic ones; the summary sentence counted "kept as printed" as needing review; nav and link styles loaded only on the landing route, which gave poor contrast in dark mode elsewhere.

## Measured (exact commands; outputs in `docs/`)
Production build, `npx next build` then `next start -p 3100`, Python service on :8000 with `PUBCHEM_ENABLED=0` for repeatable results.
- `node scripts/e2e_phase7_review.cjs` -> 18 PASS, 0 FAIL, no console errors (`phase7_e2e_review.txt`): counts add up (16 = 2 + 14 on the golden OCR text), needsReview equals its four parts, review cards equal needsReview, bulk accept lists 7 items before applying and moves exactly those 7 (14 to 7), Use this, Keep as typed, Not an ingredient plus Restore, Edit text re-run keeping earlier choices, Split merge sends `noMerge`, no unresolved item is green, nothing persisted.
- `node scripts/e2e_phase7_landing.cjs` -> 20 PASS, 0 FAIL (`phase7_e2e_landing.txt`): headline and all sections readable with JavaScript off; no horizontal scroll at 1280 and 390 px; animation on by default; sections reveal once; toggle persists across reload, removes movement animations and leaves only a fade; system `prefers-reduced-motion` honoured; CTAs work; Tab reaches a skip link; no console errors.
- **Largest contentful paint** (headless Chromium, localhost, unthrottled): 140 ms desktop, 112 ms mobile. This is indicative only, not a real-network figure. The headline moves with `transform` inside a clipping line, so its text is painted from the first frame.
- **First-load JS per route** (`scripts/route_sizes.sh`, gzip as served by `next start`; Next 16.4's build output prints no sizes): `/` 174.5 KB in 8 scripts, `/about` 173.8 KB, `/analyze` 254.2 KB, `/products` 192.2 KB. The landing page adds under 1 KB over `/about`; most of the 174 KB is the framework. Chunks the browser prefetches for linked routes are excluded.
- `node scripts/a11y_check.cjs` (axe-core, WCAG 2.0/2.1 A and AA rules; 5 pages, light and dark) -> **no automated violations** after fixing two real ones it found (button names not containing their visible text; dark-mode link contrast). Automated rules catch only part of WCAG; this is not a full audit, and I did not test with a screen reader.
- Earlier checks re-run on this build: Phase 5 e2e 15 PASS, Phase 6 e2e (mock and real service) PASS, `agent_guard_check.py` ALL PASS, `golden_check.py` 49/51 with 2 documented deviations and 0 fail.

## Deviations and limits
- **The sprig draws in with `stroke-dashoffset`, not transform/opacity.** It is an SVG stroke animation that does not touch layout; everything else in the entrance is transform or opacity.
- **Status label:** the spec's "INCI match (CosIng)" reads "INCI name match (EU glossary)", because the dictionary is the EU glossary, not CosIng.
- **Hero tags:** the Humectant and Emollient tags are illustrative. Per-ingredient function data is not loaded, so the app does not produce them; the caption says so.
- **OCR confidence:** analysis sends the whole list as one text, so per-item OCR confidence is usually "not available". Word-level confidence is not carried through.
- **Restore:** a restored fragment is not re-run through the resolver (the filter that removed it would remove it again); it appears unchecked, and you can edit it to check it.
- **Privacy diagram:** it scrolls sideways inside its own box on narrow screens so the labels stay legible.
- **Typography:** system serif and sans fonts only, to avoid a build-time font download.
- **Not done:** Hindi (your decision), real-device testing, screen-reader testing, a deployed link.
