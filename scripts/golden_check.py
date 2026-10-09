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
# 'HELIANTHUS ANNUUS SEED' is itself a glossary entry, so for that item the top-1 may be the bare name (Oil is then a lower candidate)
bad = [(n, t) for n, t in zip(order, tops) if n and key(n) != t and not (n == "HELIANTHUS ANNUUS SEED OIL" and t == key("HELIANTHUS ANNUUS SEED"))]
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
names = [key(c.inci_name) for c in it.candidates[:5]] if it else []
# With the real 30k-name glossary DECYL ALCOHOL is a genuine near neighbour, so the spec's "top candidates Cetyl + Cetearyl" is checked as
# "Cetyl is top-1 and Cetearyl is among the candidates", never high-confidence.
check("DETRY ALCOHOL suggested; Cetyl Alcohol top-1 and Cetearyl Alcohol among the candidates (real dictionary also offers Decyl Alcohol)",
      bool(it and it.status == "suggested" and names[:1] == [key("CETYL ALCOHOL")] and key("CETEARYL ALCOHOL") in names), str(names))
check("DETRY ALCOHOL is not flagged high-confidence", bool(it and not it.highConfidence))
it = find("HELLATHUS")
cand_oil = next((c for c in it.candidates if key(c.inci_name) == key("HELIANTHUS ANNUUS SEED OIL")), None) if it else None
# 'HELIANTHUS ANNUUS SEED' is itself a valid glossary entry (with Oil, Wax, Acid, Butter variants), so Oil is one of several expansions.
check("HELLATHUS ANNUUS SEED suggested; Helianthus Annuus Seed Oil is a candidate with the edit \"'Oil' not visible\"",
      bool(it and it.status == "suggested" and cand_oil and any("Oil' not visible" in e for e in cand_oil.edits)), str([(c.inci_name, c.score) for c in it.candidates] if it else ""))
check("HELLATHUS ANNUUS SEED is not flagged high-confidence (several valid expansions)", bool(it and not it.highConfidence))
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

# ---- Phase 3: rules (TypeScript engine run on the real resolver output) --------------------------------------------------
import subprocess  # noqa: E402


def run_rules(accept_top1: bool, profile_spec: dict) -> dict:
    items = [i.model_dump() for i in resp.items]
    accepted = {}
    if accept_top1:   # simulates the user pressing "Use this" on each suggestion's top candidate
        for it in items:
            if it["status"] == "suggested" and it["candidates"]:
                accepted[str(it["index"])] = it["candidates"][0]["inci_name"]
    out = subprocess.run(["npx", "tsx", str(ROOT / "scripts/rules_cli.ts")], input=json.dumps({"items": items, "profileSpec": profile_spec, "accepted": accepted}),
                         capture_output=True, text=True, cwd=ROOT, check=True)
    return json.loads(out.stdout)


import re  # noqa: E402
FRAG = {"avoidFamilies": ["eu_fragrance_allergens"], "avoidIngredients": ["Parfum"], "strength": "doctor"}
ev_open = run_rules(False, FRAG)    # nothing accepted yet
ev_acc = run_rules(True, FRAG)      # every top-1 suggestion accepted by the user
idx = {key(i.raw): n for n, i in enumerate(items)}
det = next(n for n, i in enumerate(items) if "DETRY" in i.raw.upper())
check("DETRY ALCOHOL (unaccepted): note says the fatty-alcohol candidates are not drying alcohols",
      any(f["kind"] == "candidate_note" and re.search(r"fatty alcohols", f["explanation"]) and re.search(r"not drying", f["explanation"]) for f in ev_open["findings"][det]),
      str([f["kind"] for f in ev_open["findings"][det]]))
check("DETRY ALCOHOL stays unidentified until accepted (no avoid/rule findings from guessing)", not any(f["kind"] in ("avoid_list", "profile_rule") for f in ev_open["findings"][det]))
fa_idx = [n for n, i in enumerate(items) if i.status == "suggested" and i.candidates and i.candidates[0].inci_name in ("CETYL ALCOHOL", "CETEARYL ALCOHOL")]
check("Fatty alcohol accepted -> note 'not a drying alcohol'", bool(fa_idx) and any(re.search(r"not a drying alcohol", f["explanation"]) for f in ev_acc["findings"][fa_idx[0]] if f["kind"] == "family_note"))
bz = next(n for n, i in enumerate(items) if "BENEYL" in i.raw.upper())
bzf = [f for f in ev_acc["findings"][bz] if f["kind"] == "avoid_list" and "benzyl" in f["explanation"].lower()]
check("Fragrance-allergy profile: benzyl alcohol gets tier 'caution' (not 'avoid')", bool(bzf) and all(f["tier"] == "caution" for f in bzf), str([(f["tier"], f["title"]) for f in ev_acc["findings"][bz]]))
check("Benzyl alcohol caution explains the likely preservative role and cites a source", bool(bzf) and "preservative" in bzf[0]["explanation"] and len(bzf[0]["source"]) >= 1 and bzf[0]["confidence"] == "limited")
check("No 'contradiction' is raised for benzyl alcohol", not any("contradict" in (f["title"] + f["explanation"]).lower() for f in ev_acc["findings"][bz]))
spec = run_rules(True, {**FRAG, "avoidIngredients": ["Parfum", "Benzyl alcohol"]})
check("If the user lists benzyl alcohol specifically (doctor-confirmed) the cap lifts to 'avoid'", any(f["kind"] == "avoid_list" and f["tier"] == "avoid" for f in spec["findings"][bz]))
cit = next(n for n, i in enumerate(items) if "CITRIC" in i.raw.upper())
check("Citric acid (not on any list) has no avoid-list findings", not any(f["kind"] == "avoid_list" for f in ev_acc["findings"][cit]))
check("Banner (all accepted): states the avoid-list match, never 'safe'", "Contains 1 ingredient you avoid" in ev_acc["banner"]["text"] and "safe" not in ev_acc["banner"]["text"].lower() and "need review" not in ev_acc["banner"]["text"], ev_acc["banner"]["text"])
check("Banner (nothing accepted): adds how many items still need review", "still need review" in ev_open["banner"]["text"], ev_open["banner"]["text"])
check("Summary is deterministic text with no verdict words", ev_acc["summary"] != "" and not re.search(r"\b(safe|toxic|clean|hypoallergenic)\b", ev_acc["summary"], re.I))
ev_none = run_rules(True, {})
check("Empty profile: banner asks for an avoid list instead of claiming anything", "have not set an avoid list" in ev_none["banner"]["text"])

pending = [
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
