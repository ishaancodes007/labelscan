# BeautyLens

Explains cosmetic ingredient labels (identity, formulation role, hazard, exposure, regulation and user compatibility are kept separate). No scores, no verdicts. Progress is recorded per phase in `docs/`.

**Status:** Phases 0-2 done: identity resolution service, and `/analyze` with photo quality prompts, local OCR, crop/rotate and multi-photo merge. Local OCR reads clean, large label text well but **not** small, blurry or curved ingredient lines (measured on 9 real photos: 1 reads well, 2 partially, 6 not at all; see `docs/PHASE2.md`). Rules, claims, customer features, the review panel and the landing page are **not built yet** (`app/page.tsx` is a placeholder).

```bash
npm install && npm run dev                 # Next.js app + POST /api/analyze
python3 -m venv .venv && . .venv/bin/activate && pip install -r backend/requirements.txt
(cd backend && uvicorn app.main:app --port 8000)   # identity service; set PYTHON_API_BASE_URL (see .env.example)
python scripts/resolution_report.py        # measurements          python scripts/golden_check.py   # golden case
npm run phase0                             # Phase 0 baseline diagnosis
```
See `backend/README.md`, `docs/PHASE0.md`, `docs/PHASE1.md`, `docs/PHASE2.md`. OCR measurements: `npx tsx scripts/ocr_eval.ts && python scripts/photo_report.py --exclude-bad`.
