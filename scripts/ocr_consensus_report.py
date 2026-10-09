#!/usr/bin/env python3
"""Scores single-pass OCR vs multi-pass consensus on the photo fixtures (run scripts/ocr_consensus_eval.ts first).

For each photo the OCR text is resolved by the identity service's resolver (PubChem off). An ingredient counts as READ when the resolver's
resolved name, or its top suggestion, equals the truth name (recall). precision = guesses that are in the truth / all guesses.
Truth for the real photos was read from the photos by an AI model and is NOT human-verified.
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.dictionary import Dictionary  # noqa: E402
from app.models import ResolveRequest, TokenIn  # noqa: E402
from app.pubchem import PubChemClient  # noqa: E402
from app.resolver import Resolver  # noqa: E402

r = Resolver(Dictionary(), PubChemClient(enabled=False))
D = ROOT / "backend/fixtures/photos/_ocr/consensus"

def truth_of(set_, pid):
    idx = json.load(open(ROOT / ("backend/fixtures/photos/real/index.json" if set_ == "real" else "backend/fixtures/photos/index.json")))
    e = next(x for x in idx if x["id"] == pid)
    return {x["inci"].upper() for x in e["expected"] if x.get("inci")}

def guesses(text):
    res = r.resolve(ResolveRequest(tokens=[TokenIn(index=0, raw=text)]))
    g = set()
    for i in res.items:
        if i.status == "resolved" and i.inci_name: g.add(i.inci_name.upper())
        elif i.status == "suggested" and i.candidates: g.add(i.candidates[0].inci_name.upper())
    return g

rows = []
for f in sorted(D.glob("*.json")):
    d = json.load(open(f)); t = truth_of(d["set"], d["id"])
    if not t: continue
    base = guesses(d["texts"]["ship"]); cons = guesses(d["consensus"])
    allv = set().union(*[guesses(x) for x in d["texts"].values()])
    rows.append((d["set"], d["id"], len(t), len(base & t), len(base), len(cons & t), len(cons), len(allv & t), d["ms"], len(d["consensus"].split(',')), len(d["texts"]["ship"].replace(' / ',' ').split(',')) ))
def agg(sel, label):
    n = sum(x[2] for x in sel)
    if not n: return
    b, bg, c, cg, u = (sum(x[i] for x in sel) for i in (3, 4, 5, 6, 7))
    sc = sum(x[9] for x in sel); sb = sum(x[10] for x in sel)
    print(f"  text segments per truth ingredient: single {sb/n:.2f}, consensus {sc/n:.2f}")
    print(f"{label:34s} photos={len(sel):2d} truth={n:4d} | single read {b/n*100:5.1f}% (precision {b/max(1,bg)*100:4.1f}%) | consensus {c/n*100:5.1f}% (precision {c/max(1,cg)*100:4.1f}%) | any one pass {u/n*100:5.1f}%")
print(f"{'photo':36s} truth single cons anypass")
for x in rows: print(f"{x[0]+':'+x[1]:36s} {x[2]:5d} {x[3]:6d} {x[5]:4d} {x[7]:7d}")
print()
agg(rows, "ALL photos")
agg([x for x in rows if x[0] == "synthetic"], "synthetic")
agg([x for x in rows if x[0] == "real"], "real (9 web-size product photos)")
agg([x for x in rows if x[0] == "synthetic" and any(k in x[1] for k in ("curve", "combo"))], "synthetic curved")
agg([x for x in rows if x[0] == "synthetic" and not any(k in x[1] for k in ("curve", "combo"))], "synthetic not curved")
