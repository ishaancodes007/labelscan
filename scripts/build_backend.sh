#!/usr/bin/env bash
# Build step for hosting the Python identity service (used by render.yaml). Installs dependencies, downloads the official EU glossary
# from the Publications Office and builds backend/data/inci.sqlite. Fails loudly if the result is only the 235-name seed list, so a
# degraded deployment is never silent. Set ALLOW_SEED_ONLY=1 to accept the seed list on purpose.
set -euo pipefail
pip install -r backend/requirements.txt
python scripts/fetch_glossary.py
python scripts/import_cosing.py --glossary-csv backend/data/raw/glossary_32025D1175.csv --source-date 2025-06-16 --version glossary-2025-1175
python - <<'PY'
import os, sqlite3, sys
n = sqlite3.connect("backend/data/inci.sqlite").execute("select count(*) from inci").fetchone()[0]
print(f"dictionary entries: {n}")
if n < 20000 and os.environ.get("ALLOW_SEED_ONLY") != "1":
    sys.exit("Dictionary has only %d entries (expected about 30,000). The glossary download probably failed; refusing to deploy a seed-only service." % n)
PY
