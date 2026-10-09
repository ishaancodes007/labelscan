# BeautyLens

Explains cosmetic ingredient labels: it reads the text, identifies each name, shows where each match comes from, and applies the rules *you* set. Identity, formulation role, hazard, exposure, regulation and user compatibility are kept separate. **No scores, no verdicts, no medical advice.**

**Status: sample build for demonstration (Phases 0-8; the Hindi toggle was skipped on request).** This README describes only what is actually connected. The full record, with measured numbers and limits, is in `docs/PHASE0.md` ... `docs/PHASE8.md`.

## What is connected
| Part | State |
|---|---|
| Next.js app (`/`, `/analyze`, `/products`, `/compare`, `/reactions`, `/report`, `/profile`, `/about`) | Working |
| Local OCR (Tesseract.js in the browser, photos never uploaded) | Working; reads clean, large text well and small, blurry or curved text poorly (`docs/PHASE2.md`) |
| Python identity service (`backend/`) with the 30k-name EU glossary dictionary | Working; if it is down the app falls back to a basic TypeScript matcher and says so |
| PubChem identity lookups | Live when `PUBCHEM_ENABLED=1`; may be rate-limited, which is reported as "lookup unavailable", never "no concern" |
| Open Beauty Facts (alternatives, reference formula) | Live through `/api/reference`; crowd-sourced, ODbL, attributed |
| Curated rules, actives, claims, regulation annexes (`data/`) | Cited; unverified items are listed in `data/curation/TODO.md` |
| AI name helper (opt-in) | **Built and guardrail-tested with a mock, never run against a real model** (no API key was available). `docs/PHASE6.md` |
| Per-ingredient function data (CosIng) | **Not loaded**; none is shown rather than guessed |
| Hindi, server-side OCR, accounts, server-side storage | Not built |

## Run locally
```bash
npm install
python3 -m venv .venv && . .venv/bin/activate && pip install -r backend/requirements.txt
python scripts/fetch_glossary.py && python scripts/import_cosing.py --glossary-csv backend/data/raw/glossary_32025D1175.csv --source-date 2025-06-16 --version glossary-2025-1175   # 30k-name dictionary (optional: without it the service builds a 235-name seed list)
(cd backend && uvicorn app.main:app --port 8000)
PYTHON_API_BASE_URL=http://127.0.0.1:8000 npm run dev      # http://localhost:3000
```
Copy `.env.example` for the variables. Deploying: `DEPLOY.md`. Demo script and fallbacks: `DEMO.md`.

## Measurements (re-run in Phase 8; outputs saved verbatim in `docs/phase8_*.txt`)
```bash
python scripts/resolution_report.py     # resolver on the 10 label fixtures
python scripts/golden_check.py          # golden Cetaphil case, 51 expectations
```
Other checks: `npx tsx scripts/phase5_check.ts`, `python scripts/agent_guard_check.py` (mock), and the browser checks `scripts/e2e_phase*.cjs`, `scripts/a11y_check.cjs` (need `npm i --no-save playwright-core axe-core` and the app running).

## Privacy
Photos stay in the browser. The matching service receives the ingredient text only. Profile, avoid list, saved products, routine, reaction log (separate consent) and the motion preference live in `localStorage` only, with a one-tap "Delete all my data". Servers log counts and timings, never images, profiles or ingredient lists. Secrets (`ANTHROPIC_API_KEY`, `SERVICE_TOKEN`) are server-side only.

## Handoff files
This repository started empty: there were no earlier handoff files to redirect. This README and `docs/` are the single source of truth.
