#!/usr/bin/env python3
"""Scores OCR outputs (backend/fixtures/photos/_ocr/<variant>/*.json from scripts/ocr_eval.ts) end to end:
OCR text -> Python resolver -> compare with the photo's ground truth.

  python scripts/photo_report.py                       # all variants, summary table
  python scripts/photo_report.py --variant v5_up2_contrast --detail
  python scripts/photo_report.py --exclude-bad         # drop the bad_* quality-guidance photos from the means

Metrics (per photo, then averaged):
  CER          Levenshtein(OCR text, ground-truth text) / len(truth), on A-Z0-9 only (lower is better)
  top1 rate    expected entries identified: resolved, or suggested with the right candidate at top-1 (higher is better)
  auto rate    expected entries resolved without user action
  false-accept items shown as resolved/top-1 suggestion whose identity is not in the ground truth
PubChem is off. Photos are SYNTHETIC (see scripts/make_photo_fixtures.py)."""
import argparse, json, statistics, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from rapidfuzz.distance import Levenshtein  # noqa: E402
from app.dictionary import Dictionary, key  # noqa: E402
from app.models import ResolveRequest, TokenIn  # noqa: E402
from app.normalize import without_parens  # noqa: E402
from app.pubchem import PubChemClient  # noqa: E402
from app.resolver import Resolver  # noqa: E402

import os
PH = ROOT / os.environ.get("PHOTO_DIR", "backend/fixtures/photos")


def entry_names(e):
    if e.get("suggested_any_of"):
        return {key(x) for x in e["suggested_any_of"]}, None
    if e.get("inci"):
        return {key(e["inci"])}, None
    cat = (e.get("category") or "").split()[0].lower()
    return {key(without_parens(e["raw"].replace("May Contain: ", "").replace("+/- ", "")))}, (None if cat.startswith(("trade", "common")) else cat)


def item_identity(it):
    if it.status == "resolved" and it.inci_name:
        return key(it.inci_name), "auto"
    if it.status == "suggested" and it.candidates:
        return key(it.candidates[0].inci_name), "sugg"
    return None, None


def score_text(text, entries, resolver):
    resp = resolver.resolve(ResolveRequest(tokens=[TokenIn(index=0, raw=text)]))
    items = list(resp.items)
    used, found_auto, found_top1 = set(), 0, 0
    allowed, cats = set(), set()
    n_cov = 0
    for e in entries:
        names, cat = entry_names(e)
        allowed |= names
        if cat: cats.add(cat)
        if not e.get("covered", True):
            continue   # dictionary gap, not an OCR problem: not counted as missed
        n_cov += 1
        best = None
        for n, it in enumerate(items):
            if n in used:
                continue
            ident, how = item_identity(it)
            if ident in names or (cat and it.status == "resolved" and (it.category or "").lower().startswith(cat)):
                best = (n, how or "auto"); break
        if best:
            used.add(best[0]); found_top1 += 1; found_auto += best[1] == "auto"
    fa = 0
    for n, it in enumerate(items):
        ident, _ = item_identity(it)
        if ident and ident not in allowed:
            fa += 1
        elif it.layer == "category_recognized" and n not in used and not cats:
            fa += 1
    return dict(n=n_cov, top1=found_top1, auto=found_auto, fa=fa, items=len(items))


def word_recall(truth, ocr):
    """Share of truth words (>=4 letters) that have a similar word (ratio >= 80) anywhere in the OCR text. Ignores extra OCR text."""
    import re
    from rapidfuzz import fuzz, process
    tw = [w for w in re.findall(r"[A-Za-z]{4,}", truth.upper())]
    ow = list(set(re.findall(r"[A-Za-z]{3,}", ocr.upper())))
    if not tw or not ow:
        return 0.0
    return sum(1 for w in tw if process.extractOne(w, ow, scorer=fuzz.ratio, score_cutoff=80)) / len(tw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant"); ap.add_argument("--detail", action="store_true")
    ap.add_argument("--truth", action="store_true", help="score the ground-truth text itself: the ceiling for a perfect OCR")
    ap.add_argument("--compare", nargs=2, metavar=("A", "B"), help="paired per-photo comparison of two variants"); ap.add_argument("--exclude-bad", action="store_true")
    a = ap.parse_args()
    index = [p for p in json.load(open(PH / "index.json")) if p["file"]]   # merge targets (no image) are scored by merge_report.py
    if a.exclude_bad:
        index = [p for p in index if not p["id"].startswith("bad_")]
    resolver = Resolver(Dictionary(), PubChemClient(enabled=False))
    if a.truth:
        rows = [score_text(p["truth_text"], p["expected"], resolver) for p in index]
        N = sum(r["n"] for r in rows)
        print(f"CEILING (perfect OCR text) over {len(index)} photos: top1 {sum(r['top1'] for r in rows) / N:.1%}  auto {sum(r['auto'] for r in rows) / N:.1%}  false-accept {sum(r['fa'] for r in rows)}")
        return
    if a.compare:
        A, B = a.compare
        wins = {"A": 0, "B": 0, "tie": 0}; dsum = 0
        for p in index:
            res = []
            for v in (A, B):
                o = json.load(open(PH / "_ocr" / v / f"{p['id']}.json"))
                res.append((Levenshtein.distance(key(o["text"]), key(p["truth_text"])) / max(1, len(key(p["truth_text"]))), score_text(o["text"], p["expected"], resolver)["top1"]))
            d = res[0][1] - res[1][1]
            wins["A" if d > 0 else "B" if d < 0 else "tie"] += 1; dsum += -d
            print(f"   {p['id']:18s} CER {res[0][0]:5.1%} -> {res[1][0]:5.1%}   top1 {res[0][1]} -> {res[1][1]}")
        print(f"top1 per photo: {A} better on {wins['A']}, {B} better on {wins['B']}, tie {wins['tie']}; net entries gained by {B}: {dsum}")
        return
    variants = [a.variant] if a.variant else sorted((d.name for d in (PH / "_ocr").iterdir() if d.is_dir()), key=lambda s: int(s.split("_")[0][1:]))
    print(f"photos scored: {len(index)} ({"synthetic" if all(p.get("synthetic") for p in index) else "real" if not any(p.get("synthetic") for p in index) else "mixed"})   dictionary: {resolver.d.source} ({len(resolver.d.by_key)} entries)")
    print(f"{'variant':26s} {'CER':>6s} {'wRec':>5s} {'top1':>6s} {'auto':>6s} {'FA':>3s} {'ms/photo':>9s}")
    for v in variants:
        rows = []
        for p in index:
            f = PH / "_ocr" / v / f"{p['id']}.json"
            if not f.exists():
                continue
            o = json.load(open(f))
            truth, got = key(p["truth_text"]), key(o["text"])
            cer = Levenshtein.distance(got, truth) / max(1, len(truth))
            s = score_text(o["text"], p["expected"], resolver)
            s["wr"] = word_recall(p["truth_text"], o["text"])
            rows.append((p["id"], cer, s, o["ms"]))
            if a.detail:
                print(f"   {p['id']:28s} CER {cer:5.1%} wordRecall {s['wr']:4.0%}  top1 {s['top1']}/{s['n']}  auto {s['auto']}/{s['n']}  FA {s['fa']}  conf {o['meanConfidence']:.0f}  [{','.join(p['degradations'])}]")
        if not rows:
            continue
        N = sum(r[2]["n"] for r in rows)
        print(f"{v:26s} {statistics.mean(r[1] for r in rows):6.1%} {statistics.mean(r[2]['wr'] for r in rows):5.0%} {sum(r[2]['top1'] for r in rows) / N:6.1%} "
              f"{sum(r[2]['auto'] for r in rows) / N:6.1%} {sum(r[2]['fa'] for r in rows):3d} {statistics.mean(r[3] for r in rows):9.0f}")


if __name__ == "__main__":
    main()
