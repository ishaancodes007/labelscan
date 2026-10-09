#!/usr/bin/env python3
"""Rebuild data/allergen_families.json from the primary-source annex dataset (data/regulation_1223_annexes.json, produced by
scripts/fetch_regulation.py) plus the hand-curated families. Deterministic: re-run after refreshing the annex data.
  python scripts/fetch_regulation.py && python scripts/curate_families.py"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = json.load(open(ROOT / "data/regulation_1223_annexes.json"))
META = D["meta"]
TODAY = META["retrieved"]
A = D["annexes"]
REG = {"label": f"Regulation (EC) No 1223/2009, consolidated version {META['celex'][-8:-4]}-{META['celex'][-4:-2]}-{META['celex'][-2:]} (CELEX {META['celex']}), EU Publications Office",
       "url": f"https://publications.europa.eu/resource/cellar/{META['cellar_work']}"}
SRC = {
 "reg": REG,
 "amend_2023_1545": {"label": "Commission Regulation (EU) 2023/1545 (amends Annex III: fragrance allergen labelling), EUR-Lex", "url": "https://eur-lex.europa.eu/eli/reg/2023/1545"},
 "degroot_2010": {"label": "de Groot et al., formaldehyde-releasers in cosmetics (two-part review), Contact Dermatitis 2010", "url": "https://pubmed.ncbi.nlm.nih.gov/20136875/"},
 "ema_retinoids": {"label": "EMA: updated measures for pregnancy prevention during retinoid use", "url": "https://www.ema.europa.eu/mt/news/updated-measures-pregnancy-prevention-during-retinoid-use"},
 "dermnet_terpenes": {"label": "DermNet: contact allergy to limonene and linalool", "url": "https://dermnetnz.org/topics/contact-allergy-to-limonene-and-linalool"},
 "cosing_glossary": {"label": "EU glossary of common ingredient names (Commission Implementing Decision (EU) 2025/1175)", "url": "https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database/cosing-glossary-ingredients_en"},
 "pubchem_ethanol": {"label": "PubChem: ethanol (compound record, identity only)", "url": "https://pubchem.ncbi.nlm.nih.gov/compound/702"},
 "paulaschoice": {"label": "Paula's Choice ingredient dictionary: cetearyl alcohol (secondary, retailer)", "url": "https://www.paulaschoice.co.uk/cetearyl-alcohol/ingredient-cetearyl-alcohol.html"},
}
def src(*k): return [SRC[x] for x in k]
V = {e["entry"]: e for e in A["V"]}
III = A["III"]; II = A["II_prohibited_identified"]

def uniq(seq): return list(dict.fromkeys(seq))

# ---- Annex III labelled fragrance allergens (primary) ----
lab = [e for e in III if re.search(r"presence of the substance( or substances)? (shall|must) be indicated", e["conditions"])]
members, seen = [], set()
for e in lab:
    for n in e["inci"]:
        if n in seen: continue
        seen.add(n)
        m = {"inci": n, "annex3_entry": e["entry"]}
        if n == "BENZYL ALCOHOL":
            m.update(cap_tier="caution",
                     role_note="Benzyl alcohol is on the labelled-allergen list, but Annex III (entry 45) applies that requirement only 'for purposes other than inhibiting the development of microorganisms in the product', and benzyl alcohol is also a permitted preservative (Annex V, entry 34, up to 1.0%). The label cannot tell which role it plays here, so it matters mainly if you are specifically sensitised to benzyl alcohol.",
                     role_source=src("reg"), role_confidence="established")
        members.append(m)
fam = []
fam.append({"id": "eu_fragrance_allergens", "name": "EU labelled fragrance allergens", "kind": "allergen",
  "description": "Fragrance ingredients that must be declared by name in the EU ingredient list when present above 0.001% in leave-on products or 0.01% in rinse-off products (Annex III of Regulation (EC) No 1223/2009, extended by Regulation (EU) 2023/1545). Appearing on the list means contact allergy has been reported for the substance; it does not say whether any particular product or person is affected.",
  "regulatory": {"text": "Must be named in the ingredient list above 0.001% (leave-on) or 0.01% (rinse-off) (Annex III).", "source": src("reg", "amend_2023_1545")},
  "members": members, "source": src("reg", "amend_2023_1545"), "last_verified": TODAY, "confidence": "established",
  "limits": f"{len(members)} INCI names from {len(lab)} Annex III entries, read from the consolidated text. Butylphenyl methylpropional (Lilial) and HICC (Lyral), formerly on the list, are now prohibited (Annex II). Some substances also have concentration limits or other conditions in Annex III that are not repeated here."})

fam.append({"id": "fragrance_mixtures", "name": "Fragrance / perfume mixtures", "kind": "allergen",
  "description": "'Parfum' (also written Fragrance or Aroma) stands for an undisclosed mixture of perfuming ingredients. Individual components are only named on the label if they are on the labelled-allergen list and above the thresholds.",
  "members": [{"inci": "PARFUM", "aliases": ["FRAGRANCE", "AROMA", "PARFUM/FRAGRANCE"]}],
  "source": src("cosing_glossary"), "last_verified": TODAY, "confidence": "established",
  "limits": "The glossary explains that perfuming ingredients may carry 'perfuming names'; what a given mixture contains cannot be read from the label."})

# ---- Annex V preservatives (primary) ----
pm = []
for entry, e in V.items():
    for n in e["inci"]:
        pm.append({"inci": n, "annex5_entry": entry, "max": e["conditions"][:160]})
fam.append({"id": "preservatives_annex_v", "name": "Permitted preservatives (Annex V)", "kind": "class",
  "description": "Substances the EU permits as preservatives in cosmetic products, with maximum concentrations and conditions (Annex V). A substance can also have other uses.",
  "regulatory": {"text": "Listed in Annex V of Regulation (EC) No 1223/2009 as a permitted preservative.", "source": src("reg")},
  "members": pm, "source": src("reg"), "last_verified": TODAY, "confidence": "established",
  "limits": "Names read from the consolidated Annex V. Preservative boosters not listed in Annex V (for example some glycols) are not covered, so this list is not exhaustive for 'what is acting as a preservative'."})

# ---- parabens: permitted (Annex V 12, 12a) and prohibited (Annex II) ----
perm = uniq([n for k in ("12", "12a") for n in V[k]["inci"] if "PARABEN" in n])
prohib = uniq([n for e in II for n in e["inci"] if n.endswith("PARABEN")])
fam.append({"id": "parabens", "name": "Parabens", "kind": "class",
  "description": "Esters of 4-hydroxybenzoic acid used as preservatives. In the EU methyl-, ethyl-, propyl- and butylparaben (and their salts) are permitted within limits; isopropyl-, isobutyl-, phenyl-, benzyl- and pentylparaben are prohibited.",
  "regulatory": {"text": "Methylparaben and ethylparaben: Annex V entry 12 (0.4% single ester, 0.8% mixtures, as acid). Propylparaben and butylparaben: Annex V entry 12a (0.14% sum, 0.8% with the others). Isopropyl-, isobutyl-, phenyl-, benzyl- and pentylparaben: prohibited (Annex II).", "source": src("reg")},
  "members": [{"inci": n, "status": "permitted"} for n in perm] + [{"inci": n, "status": "prohibited_annex_II"} for n in prohib],
  "source": src("reg"), "last_verified": TODAY, "confidence": "established", "limits": "Names read from the consolidated Annexes II and V; 'hexamidine paraben' (Annex V entry 47) is a salt of a different preservative and is not listed as a paraben here."})

# ---- isothiazolinones (Annex V 39, 57) ----
fam.append({"id": "isothiazolinones", "name": "Isothiazolinone preservatives", "kind": "allergen",
  "description": "Methylisothiazolinone (MI) and the methylchloroisothiazolinone/MI mixture (MCI/MI) are preservatives with well-documented contact allergy; the EU restricts them to rinse-off products.",
  "regulatory": {"text": "Annex V entries 57 (MI) and 39 (MCI/MI mixture): permitted in rinse-off products only, at a maximum of 0.0015%. Leave-on use is not permitted (see also Regulation (EU) 2016/1198 for MI).", "source": src("reg")},
  "members": [{"inci": "METHYLISOTHIAZOLINONE", "aliases": ["MI", "MIT"], "annex5_entry": "57"}, {"inci": "METHYLCHLOROISOTHIAZOLINONE", "aliases": ["MCI"], "annex5_entry": "39"}],
  "source": src("reg"), "last_verified": TODAY, "confidence": "established", "limits": "Benzisothiazolinone (BIT) is not included: no Annex V entry was found and no source for membership was verified."})

# ---- formaldehyde releasers (de Groot review + Annex V/II) ----
fr = [("DMDM HYDANTOIN", "Annex V entry 33: permitted, max 0.6%."), ("IMIDAZOLIDINYL UREA", "Annex V entry 27: permitted, max 0.6%."),
      ("DIAZOLIDINYL UREA", "Annex V entry 46: permitted, max 0.5%."), ("2-BROMO-2-NITROPROPANE-1,3-DIOL", "Annex V entry 21: permitted, max 0.1%, avoid formation of nitrosamines."),
      ("QUATERNIUM-15", "Prohibited in cosmetic products in the EU (Annex II).")]
fam.append({"id": "formaldehyde_releasers", "name": "Formaldehyde-releasing preservatives", "kind": "allergen",
  "description": "Preservatives that can release formaldehyde. Reactions to them often reflect formaldehyde itself. A review advises formaldehyde-allergic people to avoid leave-on products preserved with them. The EU requires a 'releases formaldehyde' warning when the finished product releases more than 0.001% (10 ppm).",
  "regulatory": {"text": "Annex V general note: finished products containing listed substances that release formaldehyde must carry the warning 'releases formaldehyde' when the total released exceeds 0.001% (10 ppm).", "source": src("reg")},
  "members": [{"inci": n, "regulatory_note": t} for n, t in fr] , "source": src("degroot_2010", "reg"), "last_verified": TODAY, "confidence": "established",
  "limits": "Membership comes from the de Groot review; the regulatory notes come from the consolidated text. Bronopol is listed here under its Annex V name (2-bromo-2-nitropropane-1,3-diol). The amount actually released depends on the product and cannot be read from the label."})

# ---- retinoids ----
fam.append({"id": "retinoids", "name": "Retinoids and vitamin A forms", "kind": "class",
  "description": "Vitamin A derivatives used for skin renewal. Regulators advise against topical retinoids in pregnancy as a precaution.",
  "regulatory": {"text": "Retinol, retinyl acetate and retinyl palmitate are restricted in Annex III: 0.05% retinol equivalent in body lotion and 0.3% in other products, and the label must say 'Contains Vitamin A. Consider your daily intake before use'.", "source": src("reg")},
  "members": [{"inci": "RETINOL", "annex3_entry": "376"}, {"inci": "RETINYL ACETATE"}, {"inci": "RETINYL PALMITATE"}, {"inci": "RETINAL", "aliases": ["RETINALDEHYDE"]}, {"inci": "RETINYL PROPIONATE"}, {"inci": "ADAPALENE"}],
  "source": src("ema_retinoids", "reg"), "last_verified": TODAY, "confidence": "limited",
  "limits": "The pregnancy statement is the EMA's, about topical retinoids as a class and precautionary (it notes negligible absorption); that it covers cosmetic retinol and its esters is the usual reading in secondary sources, not something the EMA page states ingredient by ingredient. Retinal and retinyl propionate have no Annex III entry here. Adapalene is a medicine, not a cosmetic ingredient."})

fam.append({"id": "fatty_alcohols", "name": "Fatty alcohols", "kind": "class",
  "description": "Waxy, long-chain alcohols (cetyl, stearyl, cetearyl, behenyl alcohol) used to soften skin and thicken creams. Chemically they are alcohols, but they are not the solvent alcohols (ethanol, alcohol denat.) that can feel drying.",
  "candidate_note": "Fatty alcohols among the possible matches are waxy softeners, not drying alcohols.", "members": [{"inci": n} for n in ("CETYL ALCOHOL", "STEARYL ALCOHOL", "CETEARYL ALCOHOL", "BEHENYL ALCOHOL")],
  "source": src("paulaschoice"), "last_verified": TODAY, "confidence": "limited",
  "limits": "Supported by a secondary retailer page; the Cosmetic Ingredient Review report was not retrieved (see TODO). This is a classification note, not a safety statement; people with damaged skin can still react to any ingredient."})
fam.append({"id": "solvent_alcohols", "name": "Solvent alcohols (ethanol type)", "kind": "class",
  "description": "Ethanol and denatured or isopropyl alcohol used as solvents. This is what 'alcohol' usually means on a label.",
  "members": [{"inci": "ALCOHOL", "aliases": ["ETHANOL"]}, {"inci": "ALCOHOL DENAT.", "aliases": ["DENATURED ALCOHOL"]}, {"inci": "ETHANOL"}, {"inci": "ISOPROPYL ALCOHOL"}],
  "source": src("pubchem_ethanol"), "last_verified": TODAY, "confidence": "established", "limits": "Chemical identity only. No claim is made here about how these feel on skin."})

# ---- pattern families (membership by INCI naming; no regulatory definition) ----
fam.append({"id": "silicones", "name": "Silicones", "kind": "class", "members": [],
  "patterns": [{"regex": "(METHICONE|SILOXANE|DIMETHICONOL|DIMETHICONE|SILSESQUIOXANE|SILICONE)\\b", "flags": "i", "exclude": []}],
  "description": "Silicone polymers and related compounds (dimethicone, siloxanes, methicones, silsesquioxanes). Identified by their INCI names. Silica and silicates are minerals, not silicones.",
  "source": src("cosing_glossary"), "last_verified": TODAY, "confidence": "limited",
  "limits": "Membership is by INCI naming convention, not by a regulatory definition; a few silicone-based names may not match and a few matches may be borderline. No source for a formal definition was verified."})
fam.append({"id": "sulfate_surfactants", "name": "Sulfate surfactants", "kind": "class", "members": [],
  "patterns": [{"regex": "(LAURYL|LAURETH|MYRETH|OLETH|PARETH|TRIDECETH|DECYL|COCO|CETEARYL|STEARYL|C\\d+-\\d+)[A-Z0-9\\- ]* SULFATE$", "flags": "i", "exclude": []}],
  "description": "Alkyl and ethoxylated alkyl sulfate cleansing agents (sodium lauryl sulfate, sodium laureth sulfate and similar). What 'sulfate-free' claims usually refer to. Mineral salts such as magnesium sulfate are not included.",
  "source": src("cosing_glossary"), "last_verified": TODAY, "confidence": "limited",
  "limits": "Membership is by INCI naming convention; the meaning of 'sulfate-free' is not defined in law, so brands may use it more narrowly or more widely."})

out = {"version": 2, "last_updated": TODAY, "generated_by": "scripts/curate_families.py from data/regulation_1223_annexes.json",
       "verification_note": f"Fragrance-allergen, preservative, paraben, isothiazolinone and retinol entries were read from the primary text of {REG['label']}. Other sources are noted per family.",
       "families": fam}
json.dump(out, open(ROOT / "data/allergen_families.json", "w"), indent=1, ensure_ascii=False)
print({f["id"]: (len(f["members"]) or "patterns") for f in fam})
