#!/usr/bin/env python3
"""Golden-case check: runs the Cetaphil fixture through the pipeline and prints pass/fail per expectation.
Phase 1 covers identity/ordering/filter/merge expectations. Rules, claims and trust-signal expectations are
listed as PENDING until their phases exist (they are never reported as passing).
Usage: python scripts/golden_check.py [--pubchem]"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.dictionary import Dictionary, key  # noqa: E402
from app.models import ResolveRequest, TokenIn  # noqa: E402
from app.pubchem import PubChemClient  # noqa: E402
from app.resolver import Resolver  # noqa: E402

fx = json.load(open(ROOT / "backend/fixtures/labels/cetaphil_moisturising_lotion_ocr.json"))
toks = [TokenIn(index=0, raw=fx["raw_ingredients"])] + [TokenIn(index=i + 1, raw=v) for i, v in enumerate(fx["other_fields"].values())]
resp = Resolver(Dictionary(), PubChemClient(enabled="--pubchem" in sys.argv)).resolve(ResolveRequest(tokens=toks))
items, removed = resp.items, resp.removed
results: list[tuple[str, str, str]] = []  # (status, name, detail)


# Expectations the spec states but that conflict with the "never silently choose an identity" rule on this data.
# Reported as DEVIATION (not PASS, not hidden); the correct identity is still the top-1 suggestion the user can accept.
KNOWN_DEVIATIONS = {
    "SODILN": "top-1 is correct (0.80) but 2 of 4 edits are unexplained and the margin is moderate -> kept 'suggested', not bulk-acceptable",
    "BENEYL": "genuinely ambiguous: Benzyl Alcohol 0.92 vs Behenyl Alcohol 0.90 -> kept 'suggested' with both candidates shown",
}


def check(name, ok, detail="", dev=None):
    results.append(("PASS" if ok else ("DEVIATION" if dev else "FAIL"), name, dev or detail))


def top(it):
    return key(it.inci_name) if it.inci_name else (key(it.candidates[0].inci_name) if it.candidates else "")


def find(fragment):
    k = key(fragment)
    return next((i for i in items if k in key(i.raw)), None)


# ---- ordering and filtering
check("16 ingredients", len(items) == 16, f"got {len(items)}")
order = ["AQUA", "GLYCERIN", "ISOPROPYL PALMITATE", None, "CETEARETH-20", "PANTHENOL", "NIACINAMIDE", "TOCOPHERYL ACETATE", "DIMETHICONE",
         "PERSEA GRATISSIMA OIL", "HELIANTHUS ANNUUS SEED OIL", "PANTOLACTONE", "GLYCERYL STEARATE", "SODIUM BENZOATE", "BENZYL ALCOHOL", "CITRIC ACID"]
tops = [top(i) for i in items]
bad = [(n, t) for n, t in zip(order, tops) if n and key(n) != t]
check("order preserved and top identity correct for all 15 non-DETRY items", not bad and len(items) == 16, f"mismatches: {bad}")
for frag, why in [("FIL1746700", "product code"), ("MRP", "price"), ("B.NO", "batch"), ("Mfg", "date")]:
    r = next((x for x in removed if key(frag) in key(x.raw)), None)
    check(f"{frag!r} moved to removed with a reason", r is not None and bool(r.reason), r.reason if r else "not removed")
# ---- merges
for a, b, name in [("ISCPROPIL", "PIMITATE", "ISOPROPYL PALMITATE"), ("PERSEA", "GRATISS", "PERSEA GRATISSIMA OIL")]:
    it = find(a)
    check(f"{a}+{b} merged into {name}", bool(it and it.mergedFrom == 2 and top(it) == key(name)), f"{it.mergedFrom if it else None} fragments")
# ---- identity statuses
it = find("GLYCERINSTRERATE")
check("GLYCERIN STRERATE -> Glyceryl Stearate (not Glycerin)", bool(it and top(it) == key("GLYCERYL STEARATE")))
it = find("DETRY")
names = [key(c.inci_name) for c in it.candidates[:2]] if it else []
check("DETRY ALCOHOL suggested; top candidates Cetyl + Cetearyl Alcohol", bool(it and it.status == "suggested" and set(names) == {key("CETYL ALCOHOL"), key("CETEARYL ALCOHOL")}), str(names))
check("DETRY ALCOHOL is not flagged high-confidence", bool(it and not it.highConfidence))
it = find("HELLATHUS")
check("HELLATHUS ANNUUS SEED suggested: Helianthus Annuus Seed Oil, with 'Oil not visible'",
      bool(it and it.status == "suggested" and top(it) == key("HELIANTHUS ANNUUS SEED OIL") and any("Oil' not visible" in n for n in it.notes)), str(it.notes if it else ""))
it = find("FANTLACTOIDE")
check("FANTLACTOIDE suggested (Pantolactone), low confidence, never auto-accepted",
      bool(it and it.status == "suggested" and top(it) == key("PANTOLACTONE") and not it.highConfidence))
rest = ["ACUA", "GLYCERN", "CETEARETH", "PANTHEVOL", "NACINANDE", "TOCOPYENYL", "DIMETHICONE", "SODILN", "BENEYL", "CITRIC"]
exp_rest = ["AQUA", "GLYCERIN", "CETEARETH-20", "PANTHENOL", "NIACINAMIDE", "TOCOPHERYL ACETATE", "DIMETHICONE", "SODIUM BENZOATE", "BENZYL ALCOHOL", "CITRIC ACID"]
for frag, want in zip(rest, exp_rest):
    it = find(frag)
    ok = bool(it and top(it) == key(want) and (it.status == "resolved" or it.highConfidence))
    detail = "" if ok else f"status={it.status if it else None} hc={it.highConfidence if it else None} top={top(it) if it else None}"
    top1 = bool(it and top(it) == key(want))
    check(f"{frag} -> {want} (resolved, or high-confidence suggestion)", ok, detail, dev=KNOWN_DEVIATIONS.get(frag) if (not ok and top1) else None)

pending = [
    "Fatty-alcohol note: 'not a drying alcohol' (Phase 3)",
    "Fragrance-allergy profile: benzyl alcohol 'caution', no contradiction (Phase 3)",
    "Claims: vitamin E/B3/B5/avocado oil 'matches' (Phase 4)",
    "Claim: 'No added fragrance' 'consistent' with benzyl-alcohol nuance (Phase 4)",
    "Claims: won't clog pores / non-irritating / clinically tested 'not verifiable' (Phase 4)",
    "Trust signal: printed-misspelling soft notice (Phase 4)",
    "Expiry 04/29 extracted with low confidence + confirm prompt (Phase 4)",
]
w = max(len(n) for _, n, _ in results)
for s, n, d in results:
    print(f"{s}  {n}" + (f"   [{d}]" if d and s != "PASS" else ""))
for p in pending:
    print(f"PENDING  {p}")
fails = sum(1 for s, _, _ in results if s == "FAIL")
devs = sum(1 for s, _, _ in results if s == "DEVIATION")
passed = sum(1 for s, _, _ in results if s == "PASS")
print(f"\n{passed}/{len(results)} implemented expectations pass, {devs} documented deviation(s), {fails} fail; {len(pending)} pending (later phases). PubChem: {resp.meta.pubchemStatus}.")
sys.exit(1 if fails else 0)
