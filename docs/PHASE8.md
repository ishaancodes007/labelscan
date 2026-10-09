# Phase 8 report: freeze, docs, demo, deployment preparation

No new product features. Added only what is needed to run it from a link.

## Done
- **Docs:** `README.md` rewritten to describe only what is connected (a table of working / optional / not built); `backend/README.md` corrected (it still described the 235-name seed dictionary and an unbuilt agent); `.env.example` now lists `PYTHON_API_BASE_URL`, `PYTHON_API_TOKEN`, `RESOLVER_TIMEOUT_MS`, `SERVICE_TOKEN`, `PUBCHEM_ENABLED`, `ANTHROPIC_API_KEY`, `ANTHROPIC_RESOLVER_MODEL`, and says there are no OCR consent flags because there is no server OCR path. **Old handoff files:** none existed (the repository started empty), so there was nothing to redirect; the README says so.
- **`DEMO.md`:** 3-minute script on the golden Cetaphil case plus one routine and one reaction-log example, with fallbacks: a pre-recorded video and an offline path using local fixtures.
- **`docs/demo.webm`:** a 76 s captioned, silent recording of the same flow, made with `node scripts/record_demo.cjs` against the production build. I checked frames from it; the "No added fragrance is consistent" caption was verified against the live page (it reads "Consistent with the ingredient list" once every item is accepted).
- **Deployment preparation** (not deployed; see below): `render.yaml`, `scripts/build_backend.sh`, `DEPLOY.md`, a shared-secret check on the Python service (`SERVICE_TOKEN` / `x-service-token`), a `/api/warm` route that wakes an idle service when `/analyze` opens, `RESOLVER_TIMEOUT_MS`, and `maxDuration = 30` on `/api/analyze`.

## Deployment status: **not deployed, no URL**
I cannot deploy from this environment: it has no Vercel or Render account, and deploying needs yours. `DEPLOY.md` gives the click-by-click steps (Render for the Python service, then Vercel for the site, about 10 minutes). What I verified locally:
- `bash scripts/build_backend.sh` in a **fresh virtualenv** installed the requirements, downloaded the glossary, built a 30,421-entry dictionary, and the service answered `/healthz` and resolved a request.
- With `SERVICE_TOKEN=s3cret`: the service returned **401** without the token and 200 with it; the Next app (with `PYTHON_API_TOKEN=s3cret`) reached it and returned the enhanced engine; `/api/warm` returned `{"ok":true}`.
- `next build` succeeds and the production server passes the browser checks below.
What is **not** verified: Render's and Vercel's own screens, plan limits and cold-start times; **Python 3.12** (Render's pinned version; developed and tested on 3.13); the Vercel function time limit on the free plan.

## Final measurements (exact commands; outputs verbatim in `docs/`)
- `python scripts/resolution_report.py` -> `docs/phase8_resolution_report.txt` (PubChem off, 30,373-entry dictionary, 10 label fixtures): 110 expected entries; 95 auto-resolved (86.4%), 95 correct, 0 wrong; 15 suggested (13 top-1 correct, 1 top-1 wrong, 1 correct only in top-3); **false-accept count 1**; high-confidence suggestions 7 (7 correct, 0 wrong); removed-fragment recall 7/7; latency mean 63 ms, max 597 ms; golden case 15/16.
- `python scripts/golden_check.py` -> `docs/phase8_golden_check.txt`: **49/51 pass, 2 documented deviations (SODILN BENDATE: top-1 correct but not bulk-acceptable; BENEYL ALCOHOL: genuinely ambiguous with Behenyl Alcohol), 0 fail, 0 pending.**
- Re-run on the final build: `node scripts/e2e_phase7_review.cjs` 18 PASS; `node scripts/e2e_phase7_landing.cjs` 20 PASS; `node scripts/e2e_phase5.cjs` 15 PASS; `MODE=real node scripts/e2e_phase6.cjs` no failures; `node scripts/a11y_check.cjs` no automated violations; `python scripts/agent_guard_check.py` ALL PASS (mock).

## What is still not real (all of it is in the README table too)
- **The AI helper has never run against a real model.** No key was available.
- **No function data** (CosIng): functions are never shown. The hero tags on the landing page are illustrative and labelled so.
- **Local OCR is weak on small, blurry or curved text** (measured on real photos in `docs/PHASE2.md`); the demo uses pasted text for that reason. The Phase 2 numbers were measured with the seed dictionary and not re-measured with the glossary.
- **Curated data is small and partly low-confidence**; unverified items are in `data/curation/TODO.md` (for example vitamin C stacking, most ingredient substitutions, the unreviewed Hindi glossary, which is unused).
- Not tested: real phones, screen readers, the 3.12 Python runtime, any deployed host.
