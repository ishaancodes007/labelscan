#!/usr/bin/env python3
"""Build backend/data/inci.sqlite (the local INCI dictionary).

  python scripts/import_cosing.py --seed
      Build from the hand-written seed list (backend/data/seed_inci.csv). No CosIng data, no functions/CAS.

  python scripts/import_cosing.py --cosing-file path/to/cosing.csv --source-date 2025-06-16 --version cosing-2025-06
      Build from an official EU CosIng / glossary CSV export you downloaded yourself. The seed list's common-name
      aliases are merged in for names that exist in the import.

Column mapping is tolerant (case/punctuation-insensitive) and UNVERIFIED against the current official export:
  INCI name | CAS No | EC No | Function(s) | Chem/IUPAC Name / Description | COSING Ref No
If your file's headers differ, the script prints what it found and exits; adjust HEADER_ALIASES below.

Where to get the data (verify the current terms of reuse before redistributing anything):
  EU CosIng glossary page: https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database/cosing-glossary-ingredients_en
  The glossary is adopted by Commission Implementing Decision (EU) 2025/1175 (16 June 2025).
Do NOT commit large raw dumps; the built .sqlite is git-ignored. Re-run this script to rebuild.
"""
import argparse, csv, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import dictionary as D  # noqa: E402

HEADER_ALIASES = {
    "inci_name": ["inciname", "incinametitle", "name"],
    "cas": ["casno", "cas", "casnumber"],
    "ec": ["ecno", "ec", "ecnumber"],
    "functions": ["functions", "function"],
    "description": ["chemiupacnamedescription", "chemiupacname", "description"],
    "cosing_ref": ["cosingrefno", "refno", "cosingref"],
}


def norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]", "", h.lower())


def read_cosing(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    sniff = csv.Sniffer().sniff(text[:4000], delimiters=",;|\t")
    rdr = csv.DictReader(text.splitlines(), dialect=sniff)
    cols = {}
    for field in rdr.fieldnames or []:
        for target, names in HEADER_ALIASES.items():
            if norm_header(field) in names and target not in cols:
                cols[target] = field
    if "inci_name" not in cols:
        sys.exit(f"Could not find an INCI-name column. Headers found: {rdr.fieldnames}")
    rows = []
    for r in rdr:
        name = (r.get(cols["inci_name"]) or "").strip()
        if name:
            rows.append({k: (r.get(v) or "").strip() for k, v in cols.items()} | {"inci_name": name, "aliases": []})
    return rows


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--seed", action="store_true")
    g.add_argument("--cosing-file", type=Path)
    ap.add_argument("--source-date", default="", help="publication/update date of the source file (YYYY-MM-DD)")
    ap.add_argument("--version", default="")
    ap.add_argument("--out", type=Path, default=D.DEFAULT_DB)
    a = ap.parse_args()
    if a.seed:
        n = D.build_seed_db(a.out)
        print(f"built seed dictionary: {n} entries -> {a.out}")
        return
    rows = read_cosing(a.cosing_file)
    by = {r["inci_name"].upper(): r for r in rows}
    for s in D.load_seed_rows():  # merge seed common-name aliases / categories for names present in the import
        r = by.get(s["inci_name"].upper())
        if r:
            r["aliases"] = s["aliases"]; r["category"] = s.get("category")
    n = D.build_db(a.out, rows, {
        "dictionaryVersion": a.version or f"cosing-{a.source_date or 'undated'}", "dictionarySource": "cosing",
        "dictionarySourceDate": a.source_date, "note": f"imported from {a.cosing_file.name}"})
    print(f"built CosIng dictionary: {n} entries -> {a.out} (source date {a.source_date or 'unknown'})")


if __name__ == "__main__":
    main()
