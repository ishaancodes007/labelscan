#!/usr/bin/env python3
"""Merge researched ingredient-function batches into data/ingredient_functions.json.

Usage: python scripts/build_functions.py batch0_out.json batch1_out.json ...
Each batch: {"entries":[{"inci","functions":[...],"kind","label","url","quote","note"}]}.
Conservative rules (a wrong role is worse than a missing one):
  - an entry needs at least one function, a real https URL and a kind other than "unverified";
  - Cosmile labels are normalised to CosIng-style terms (FRAGRANCE -> PERFUMING, pH adjustment -> BUFFERING) and the meaningless FRAGRANCE FUNCTIONAL (a fragrance-excipient label) is not shown;
  - entries based on translated pages are KEPT but their note says so;
  - entries the researcher flagged as doubtful are dropped (EXCLUDE below, with the reason);
  - the page behind each entry was NOT opened (search-result text only), which is recorded in the provenance and shown in the UI.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCLUDE = {
    "ALUMINUM HYDROXIDE": "sources conflict (SkinSort garbled vs CIR: buffering / pH adjuster)",
    "AZELAIC ACID": "only a German page was found and its 'perfuming' looks wrong",
    "ALLANTOIN": "functions inferred from inconsistent French/Romanian translations",
}
TRANSLATED = re.compile(r"translat|non-english|\b(spanish|french|german|bulgarian|greek|polish|dutch|italian|romanian)\b|inferred", re.I)

def main(paths):
    out, dropped, seen = [], [], set()
    for p in paths:
        for e in json.load(open(p))["entries"]:
            name = e["inci"].strip().upper()
            why = None
            if name in EXCLUDE: why = EXCLUDE[name]
            elif e.get("kind") == "unverified" or not e.get("functions"): why = "unverified"
            elif not str(e.get("url", "")).startswith("https://"): why = "no https url"
            if why:
                dropped.append((name, why)); continue
            if name in seen: continue
            seen.add(name)
            norm = {"FRAGRANCE": "PERFUMING", "PH ADJUSTMENT": "BUFFERING", "PH-ADJUSTMENT": "BUFFERING", "PH ADJUSTER": "BUFFERING"}
            e["functions"] = [norm.get(f.strip().upper(), f.strip().upper()) for f in e["functions"] if f.strip().upper() not in ("FRAGRANCE FUNCTIONAL", "FRAGRANCE EXCIPIENT")]
            if not e["functions"]:
                dropped.append((name, "only a fragrance-excipient label")); continue
            fns = sorted({f.strip().upper() for f in e["functions"] if f.strip()}, key=lambda x: e["functions"].index(next(y for y in e["functions"] if y.strip().upper() == x)))
            out.append({"inci": name, "functions": fns, "kind": e["kind"], "label": e.get("label", ""), "url": e["url"], "quote": e.get("quote", ""), "note": e.get("note", "")})
    out.sort(key=lambda x: x["inci"])
    doc = {"version": 1, "last_verified": "2026-10-10",
           "provenance": ("Listed cosmetic functions per ingredient, researched through web-search results for Cosmetics Europe's COSMILE INCI database (cosmileeurope.eu), CIR summaries and pages that mirror CosIng. "
                          "THE PAGES WERE NOT OPENED (this environment cannot reach those hosts); each entry rests on search-result text for a URL that appeared in the results, so wording can differ from the official CosIng record "
                          "(Cosmile uses some labels CosIng does not, such as FRAGRANCE FUNCTIONAL and pH adjustment). Entries the researcher flagged as doubtful were left out; entries read from translated pages are kept and say so in their note. "
                          "Confidence for every entry is 'limited'. Please check against CosIng (ec.europa.eu/growth/tools-databases/cosing) before relying on any of it."),
           "confidence": "limited", "entries": out}
    (ROOT / "data" / "ingredient_functions.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    kinds = {}
    for e in out: kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    print(f"kept {len(out)} ({kinds}); dropped {len(dropped)}")
    for n, w in dropped: print(f"  dropped {n}: {w}")

if __name__ == "__main__":
    main(sys.argv[1:])
