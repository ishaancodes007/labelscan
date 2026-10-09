#!/usr/bin/env python3
"""Scores multi-photo merge: each photo alone vs the merged text, against the FULL ingredient list (same scorer as photo_report.py).
Run after: npx tsx scripts/ocr_eval.ts v17_shipped_pipeline && npx tsx scripts/merge_eval.ts"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from photo_report import PH, Resolver, Dictionary, PubChemClient, score_text  # noqa: E402

V = "v17_shipped_pipeline"
idx = {p["id"]: p for p in json.load(open(PH / "index.json"))}
resolver = Resolver(Dictionary(), PubChemClient(enabled=False))
print("full-list recall (identified at top-1 / expected entries); auto = resolved without user action")
for tgt, a, b in [("merged_g", "pair_g_a", "pair_g_b"), ("merged_sh", "pair_sh_a", "pair_sh_b")]:
    full = idx[tgt]["expected"]
    print(f"\n{tgt}  ({len(full)} expected entries)")
    for label, pid in [("photo A alone", a), ("photo B alone", b), ("MERGED", tgt)]:
        text = json.load(open(PH / "_ocr" / V / f"{pid}.json"))["text"]
        s = score_text(text, full, resolver)
        print(f"   {label:14s} top1 {s['top1']:2d}/{s['n']} ({s['top1'] / s['n']:.0%})   auto {s['auto']:2d}/{s['n']}   false-accept {s['fa']}")
    print(f"   ceiling (perfect text)  top1 " + str(score_text(idx[tgt]['truth_text'], full, resolver)['top1']) + f"/{len(full)}")
