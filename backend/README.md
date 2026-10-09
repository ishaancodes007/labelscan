# BeautyLens identity service (`backend/`)

Python 3.12+ / FastAPI. **Identity only**: it never applies safety, role or compatibility rules (those live in TypeScript).

## Run
```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
python scripts/import_cosing.py --seed            # optional: the service auto-builds the seed dictionary if missing
cd backend && uvicorn app.main:app --port 8000
```
Set `PYTHON_API_BASE_URL=http://127.0.0.1:8000` for the Next.js app (see `.env.example`). `PUBCHEM_ENABLED=0` turns live PubChem lookups off.

## `POST /v1/ingredients/resolve`
Request `{tokens:[{index, raw, ocrWordConfidence?}], useAgent, locale}`; a token may hold a whole ingredient paragraph.
Response `{items, removed, meta}`; models in `app/models.py`, TypeScript mirror in `lib/resolverTypes.ts`.

Pipeline: normalize (NFKC, hyphenated line-break rejoin, split on `,` `;` outside parentheses, "may contain"/`+/-`, `(nano)`) →
non-ingredient filter (price, batch, dates, codes, directions, packaging copy) → ladder
`inci_exact` → `inci_alias` → `category_recognized` (botanical, polymer, fragrance, CI colorant) → merge adjacent fragments →
split lost-comma tokens → PubChem (CAS, name, autocomplete) → OCR-weighted fuzzy (≤3 candidates) → `not_found` / `lookup_unavailable`.
Any fuzzy or merged/split result is `suggested` until the user accepts it; `highConfidence` marks suggestions safe to offer for bulk review.

## What is actually connected (and what is not)
- **Dictionary: a 235-name hand-written SEED list** (`data/seed_inci.csv`), *not* CosIng. It has no functions, CAS numbers or regulatory data. `meta.dictionarySource` says `seed`.
- `scripts/import_cosing.py --cosing-file <csv>` builds the real dictionary from an official CosIng/glossary CSV. **It has only been run on a synthetic CSV**: the official export's real headers are unverified, and the official data hosts (`publications.europa.eu`, `data.europa.eu`, `eur-lex.europa.eu`) were unreachable from the build environment. Check the current terms of reuse before using or redistributing the data.
- PubChem: live calls verified for name and CAS lookups (e.g. niacinamide → CID 936). The shared egress IP was intermittently throttled (HTTP 429), so full-label runs often ended `lookup_unavailable`; that state is reported, never treated as "no concern". The autocomplete relevance filter and outage handling were checked against a mock, not live.
- The AI helper (Phase 6, `app/agent.py`) is built but **has never been run against a real model** (no API key in the build environment). Its guardrails are checked with a scripted mock model (`python scripts/agent_guard_check.py`). See `docs/PHASE6.md`.

## Tuning
Thresholds live in `app/resolver.py` (`THRESHOLDS`) and edit costs in `app/ocr_confusion.py`; both are heuristics. See `docs/PHASE1.md` for how far they are calibrated (not far).

## Opt-in AI helper (last resort)
Off unless the request has `useAgent: true` (the UI checkbox is unchecked by default) **and** the server has both variables, read from the Python environment only:
`ANTHROPIC_API_KEY` and `ANTHROPIC_RESOLVER_MODEL`. There is no default model on purpose. Anthropic's models overview (checked 2026-10-09) lists `claude-haiku-5-5` as the fastest, intended for classification and extraction, `claude-sonnet-5-5` as the speed/intelligence balance; pick one yourself and re-check the page for current IDs. The server also needs network access to `api.anthropic.com`.
Without both variables `meta.agentStatus` is `unavailable` and nothing else changes.
