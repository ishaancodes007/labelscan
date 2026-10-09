# BeautyLens

Explains cosmetic ingredient labels (identity, formulation role, hazard, exposure, regulation and user compatibility are kept separate). No scores, no verdicts. Progress is recorded per phase in `docs/`.

**Status:** Phase 1 (identity resolution service) done. The browser OCR/review UI, rules, claims, customer features and landing page are **not built yet**; `app/page.tsx` is a placeholder.

```bash
npm install && npm run dev                 # Next.js app + POST /api/analyze
python3 -m venv .venv && . .venv/bin/activate && pip install -r backend/requirements.txt
(cd backend && uvicorn app.main:app --port 8000)   # identity service; set PYTHON_API_BASE_URL (see .env.example)
python scripts/resolution_report.py        # measurements          python scripts/golden_check.py   # golden case
npm run phase0                             # Phase 0 baseline diagnosis
```
See `backend/README.md`, `docs/PHASE0.md`, `docs/PHASE1.md`.
