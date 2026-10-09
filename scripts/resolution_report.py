#!/usr/bin/env python3
"""Resolution report over backend/fixtures/labels.

Usage (from repo root, venv active):
  python scripts/resolution_report.py                 # current resolver, PubChem off
  python scripts/resolution_report.py --pubchem       # PubChem on (live network)
  python scripts/resolution_report.py --baseline      # exact-key-match only (Phase 0 behaviour) on the SAME dictionary
  python scripts/resolution_report.py --noise 3 --seed 1   # add synthetic random-edit copies of the clean fixtures
  python scripts/resolution_report.py --sweep         # threshold sweep (uses real + synthetic fixtures)

Outcome per expected entry: resolved_ok | resolved_wrong | sugg_top1_ok | sugg_top1_wrong | sugg_top3_only |
category_ok | category_wrong | not_found | unavailable | missing | unresolved_ok (expected to stay unresolved).
false-accept = resolved_wrong + sugg_top1_wrong (an item the UI would show with a wrong identity if accepted).
"""
import argparse, copy, json, random, statistics, sys, time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.dictionary import Dictionary, key  # noqa: E402
from app.models import ResolveRequest, TokenIn  # noqa: E402
from app.pubchem import PubChemClient  # noqa: E402
from app.resolver import THRESHOLDS, Resolver  # noqa: E402

FIX = ROOT / "backend" / "fixtures" / "labels"


def load_fixtures():
    return [json.load(open(p)) for p in sorted(FIX.glob("*.json"))]


def request_for(fx):
    toks = [TokenIn(index=0, raw=fx["raw_ingredients"])]
    for i, v in enumerate((fx.get("other_fields") or {}).values()):
        toks.append(TokenIn(index=i + 1, raw=v))
    return ResolveRequest(tokens=toks)


def noisy_copy(fx, rng):
    """Synthetic random character edits (NOT OCR-realistic) on identity entries of a clean fixture."""
    fx = copy.deepcopy(fx)
    parts = []
    for e in fx["expected"]:
        raw = e["raw"]
        if e.get("inci") and len(raw) >= 6 and " + " not in raw:
            s = list(raw)
            for _ in range(rng.choice([1, 1, 2])):
                i = rng.randrange(1, len(s) - 1)
                op = rng.choice(["sub", "del", "ins", "swap"])
                if op == "sub": s[i] = rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
                elif op == "del": del s[i]
                elif op == "ins": s.insert(i, rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
                else: s[i], s[i - 1] = s[i - 1], s[i]
            raw = "".join(s)
            e["raw"] = raw
        parts.append(raw)
    fx["raw_ingredients"] = ", ".join(parts)
    fx["id"] += "~noise"
    fx["expected_removed"] = []
    return fx


def baseline_response(fx, d: Dictionary):
    """Phase 0 behaviour: split on commas, exact key match against the dictionary. No merge, fuzzy or categories."""
    from app.models import ResolveResponse, ResolvedItem, Meta
    from app.normalize import clean_text, split_top_level
    items = []
    for n, part in enumerate(p.strip() for p in split_top_level(clean_text(fx["raw_ingredients"])) if p.strip()):
        e = d.exact(key(part)) or d.alias(key(part))
        items.append(ResolvedItem(index=n, sourceIndex=0, raw=part, status="resolved" if e else "not_found",
                                  layer="inci_exact" if e else "not_found", inci_name=e.inci_name if e else None))
    return ResolveResponse(items=items, removed=[], meta=Meta(dictionaryVersion="-", dictionarySource=d.source))


def find_item(items, exp_raw):
    import re
    exp_raw = re.sub(r"^(?:may contain\s*:?|\+/-)\s*", "", exp_raw.replace(" + ", ""), flags=re.I)
    want = key(exp_raw)
    for it in items:
        if key(it.raw) == want:
            return it
    for it in items:  # fallback: one side contains the other AND they are close in length (>=80%)
        k = key(it.raw)
        if min(len(k), len(want)) >= 5 and (want in k or k in want) and min(len(k), len(want)) / max(len(k), len(want)) >= 0.8:
            return it
    return None


def outcome(e, it):
    if it is None:
        return "missing"
    if e.get("inci"):
        want = key(e["inci"])
        if it.status == "resolved":
            if it.inci_name and key(it.inci_name) == want: return "resolved_ok"
            return "resolved_wrong"
        if it.status == "suggested":
            names = [key(c.inci_name) for c in it.candidates]
            if names and names[0] == want: return "sugg_top1_ok"
            if want in names: return "sugg_top3_only"
            return "sugg_top1_wrong"
        return "unavailable" if it.status == "lookup_unavailable" else "not_found"
    if e.get("suggested_any_of"):
        want = {key(x) for x in e["suggested_any_of"]}
        names = [key(c.inci_name) for c in it.candidates]
        if it.status == "suggested" and names[:1] and names[0] in want and want <= set(names): return "sugg_top1_ok"
        return "sugg_top1_wrong" if it.status == "suggested" else "not_found"
    cat = (e.get("category") or "").lower()
    if it.status == "resolved" and it.layer in ("inci_exact", "inci_alias"): return "category_ok"  # dictionary knows it
    if cat.startswith(("trade", "common")):
        return "unresolved_ok" if it.status in ("not_found", "lookup_unavailable") else ("resolved_wrong" if it.status == "resolved" else "sugg_top1_wrong")
    if it.status == "resolved" and (it.category or "").lower().startswith(cat.split()[0]): return "category_ok"
    if it.status == "resolved": return "category_wrong"
    return "unavailable" if it.status == "lookup_unavailable" else "not_found"


def evaluate(fixtures, resolver=None, baseline_dict=None):
    rows, layer_ok, layer_n, lat = [], Counter(), Counter(), []
    out_total, removed_ok, removed_n, wrongly_removed = Counter(), 0, 0, 0
    hc = Counter()
    ms = Counter()
    for fx in fixtures:
        t0 = time.perf_counter()
        resp = baseline_response(fx, baseline_dict) if baseline_dict else resolver.resolve(request_for(fx))
        lat.append((time.perf_counter() - t0) * 1000)
        grp = 'golden' if fx.get('golden') else ('synthetic' if '~' in fx['id'] else 'clean')
        ms[grp + '_merges'] += sum(1 for i in resp.items if i.mergedFrom)
        ms[grp + '_splits'] += sum(1 for i in resp.items if i.splitFrom) // 2
        for e in fx["expected"]:
            it = find_item(resp.items, e["raw"])
            o = outcome(e, it)
            if it is None:  # maybe wrongly removed
                if any(key(e["raw"]) in key(r.raw) or key(r.raw) in key(e["raw"]) for r in resp.removed if len(key(r.raw)) >= 5):
                    wrongly_removed += 1
            out_total[o] += 1
            rows.append((fx["id"], e["raw"], o, it))
            if it is not None:
                layer_n[it.layer] += 1
                if o in ("resolved_ok", "category_ok", "sugg_top1_ok", "unresolved_ok"): layer_ok[it.layer] += 1
                if it.status == "suggested" and it.highConfidence:
                    hc["total"] += 1; hc["ok" if o == "sugg_top1_ok" else "wrong"] += 1
        for r in fx.get("expected_removed", []):
            removed_n += 1
            removed_ok += any(key(r["raw"]) in key(x.raw) or key(x.raw) in key(r["raw"]) for x in resp.removed if len(key(x.raw)) >= 4)
    return dict(out=out_total, rows=rows, layer_ok=layer_ok, layer_n=layer_n, lat=lat, removed=(removed_ok, removed_n),
                wrongly_removed=wrongly_removed, hc=hc, ms=ms)


def print_report(title, r):
    o, n = r["out"], sum(r["out"].values())
    pct = lambda x: f"{100 * x / n:5.1f}%" if n else "  n/a"
    resolved = o["resolved_ok"] + o["category_ok"] + o["resolved_wrong"] + o["category_wrong"]
    sugg = sum(o[k] for k in ("sugg_top1_ok", "sugg_top1_wrong", "sugg_top3_only"))
    nf = o["not_found"] + o["unavailable"] + o["missing"] + o["unresolved_ok"]
    fa = o["resolved_wrong"] + o["category_wrong"] + o["sugg_top1_wrong"]
    print(f"\n=== {title} ===")
    print(f"expected entries: {n}")
    print(f"resolved (auto):   {resolved:3d} {pct(resolved)}   (correct {o['resolved_ok'] + o['category_ok']}, wrong {o['resolved_wrong'] + o['category_wrong']})")
    print(f"suggested:         {sugg:3d} {pct(sugg)}   (top-1 correct {o['sugg_top1_ok']}, top-1 wrong {o['sugg_top1_wrong']}, correct only in top-3 {o['sugg_top3_only']})")
    print(f"not found/other:   {nf:3d} {pct(nf)}   (not_found {o['not_found']}, lookup_unavailable {o['unavailable']}, missing {o['missing']}, expected-unresolved {o['unresolved_ok']})")
    print(f"FALSE-ACCEPT count (auto-resolved wrong + top-1 suggestion wrong): {fa}")
    h = r["hc"]
    print(f"high-confidence suggestions: {h['total']} (correct {h['ok']}, wrong {h['wrong']})")
    print(f"removed-fragment recall: {r['removed'][0]}/{r['removed'][1]}   wrongly removed ingredients: {r['wrongly_removed']}")
    m = r["ms"]
    print("merges/splits proposed: " + ", ".join(f"{k}={v}" for k, v in sorted(m.items())) + "  (any on the clean group is a false proposal)")
    print("per layer (items matched to an expected entry): layer  n  correct")
    for layer in sorted(r["layer_n"]):
        print(f"   {layer:20s} {r['layer_n'][layer]:3d} {r['layer_ok'][layer]:3d}")
    lat = r["lat"]
    print(f"latency per label: mean {statistics.mean(lat):.0f} ms, max {max(lat):.0f} ms over {len(lat)} labels")


def sweep(fixtures):
    """Calibration sweep: golden + clean fixtures + 5 seeded random-edit copies of each clean fixture. Objective: no wrong high-confidence
    suggestion; among those settings, as many correct ones as possible. Evaluate the chosen setting on held-out data afterwards."""
    rng = random.Random(7)
    pool = list(fixtures) + [noisy_copy(f, rng) for f in fixtures if not f.get("golden") for _ in range(5)]
    print(f"\n=== threshold sweep on {len(pool)} labels ({len(fixtures)} fixtures + synthetic random-edit copies) ===")
    print("high_score margin max_unexpl dom_score dom_margin | high-conf total  correct  wrong")
    res = Resolver(Dictionary(), PubChemClient(enabled=False))  # one resolver: fuzzy cache is shared across configs
    rows = []
    for hs in (0.75, 0.80, 0.85):
        for mg in (0.05, 0.08, 0.12):
            for mu in (1, 2):
                for ds in (0.85, 0.90):
                    for dm in (0.12, 0.15, 0.20, 0.25):
                        res.T = {**THRESHOLDS, "high_score": hs, "high_margin": mg, "max_unexplained": mu, "dominant_score": ds, "dominant_margin": dm}
                        h = evaluate(pool, res)["hc"]
                        rows.append((hs, mg, mu, ds, dm, h["total"], h["ok"], h["wrong"]))
                        print(f"  {hs:.2f}   {mg:.2f}      {mu}        {ds:.2f}     {dm:.2f}     | {h['total']:5d}  {h['ok']:7d}  {h['wrong']:5d}")
    safe = [r for r in rows if r[7] == 0]
    print(f"\nsettings with 0 wrong high-confidence suggestions: {len(safe)} of {len(rows)}")
    if safe:
        best = max(safe, key=lambda r: r[6])
        print("most correct high-confidence suggestions with 0 wrong:", best)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pubchem", action="store_true"); ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--noise", type=int, default=0); ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--sweep", action="store_true"); ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    fx = load_fixtures()
    d = Dictionary()
    print(f"dictionary: version={d.meta.get('dictionaryVersion')} source={d.source} entries={len(d.by_key)}  fixtures={len(fx)}")
    if a.sweep:
        return sweep(fx)
    if a.noise:
        rng = random.Random(a.seed)
        fx = fx + [noisy_copy(f, rng) for f in fx if not f.get("golden") for _ in range(a.noise)]
    resolver = None if a.baseline else Resolver(d, PubChemClient(enabled=a.pubchem))
    title = ("BASELINE (exact match only)" if a.baseline else f"RESOLVER (PubChem {'ON' if a.pubchem else 'OFF'}) thresholds={ {k: v for k, v in THRESHOLDS.items() if k.startswith('high') or k == 'max_unexplained'} }")
    r = evaluate(fx, resolver, d if a.baseline else None)
    print_report(title + (f" +synthetic noise x{a.noise}" if a.noise else ""), r)
    g = [x for x in r["rows"] if x[0].startswith("cetaphil") and "~" not in x[0]]
    if g:
        ok = sum(1 for _, _, o, _ in g if o in ("resolved_ok", "category_ok", "sugg_top1_ok"))
        print(f"golden case: {ok}/{len(g)} entries resolved or correctly suggested at top-1")
    if a.verbose:
        for fid, raw, o, it in r["rows"]:
            if o not in ("resolved_ok", "category_ok"):
                print(f"  {fid:34s} {o:16s} {raw!r}")


if __name__ == "__main__":
    main()
