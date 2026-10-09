#!/usr/bin/env python3
"""Builds backend/fixtures/photos/real/index.json for REAL label photos supplied by the project owner.
Ground-truth ingredient text was read from the photos by an AI model (NOT human-verified: truth_verified=false);
please correct the lists below if any entry is wrong. `crop` = the ingredient-list region as fractions of the image
(what a user would select with the crop sliders). `covered` = the seed dictionary (or a category pattern) can identify it,
so OCR quality is not conflated with dictionary gaps."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.dictionary import Dictionary, key  # noqa: E402
from app.categories import classify  # noqa: E402
from app.normalize import without_parens  # noqa: E402

D = Dictionary()
PHOTOS = [
 dict(id="real_cetaphil_lotion", file="real_cetaphil_lotion.jpg", product="Cetaphil Moisturising Lotion (back of bottle, hand-held, 556x800)",
      crop=dict(x=0.35, y=0.715, w=0.50, h=0.075),
      notes="The real pack behind the golden OCR fixture. Ingredient line is ~7px tall in this image.",
      names="Aqua, Glycerin, Isopropyl Palmitate, Cetearyl Alcohol, Ceteareth-20, Panthenol, Niacinamide, Tocopheryl Acetate, Dimethicone, Persea Gratissima Oil, Helianthus Annuus Seed Oil, Pantolactone, Glyceryl Stearate, Sodium Benzoate, Benzyl Alcohol, Citric Acid"),
 dict(id="real_minimalist_vitc_serum", file="real_minimalist_vitc_serum.jpg", product="Minimalist Vitamin C serum label, India (hand-held, 700x659, watermark)",
      crop=dict(x=0.20, y=0.28, w=0.62, h=0.13),
      notes="Has 'Ingredients:' heading, MRP/Batch/Mfg fields and a 'No Fragrance...' claims box nearby.",
      names="Centella Asiatica Leaf Water, 3-O-Ethyl Ascorbic Acid, Ethoxydiglycol, Dimethyl Isosorbide, Glycerin, Sodium Gluconate, Acetyl Glucosamine, Sodium Hyaluronate, Pullulan, Hydroxyethylcellulose, Xanthan Gum, Sclerotium Gum, Phenoxyethanol, Ethylhexylglycerin, Lecithin, Lactic Acid"),
 dict(id="real_nivea_body_lotion", file="real_nivea_body_lotion.jpg", product="Nivea body lotion, curved blue bottle, skewed text, watermark (1200x1600)",
      crop=dict(x=0.14, y=0.80, w=0.56, h=0.16),
      notes="Curved bottle, white text on blue, text tilted. Contains 'Fragrance' and a 'Skin compatibility dermatologically tested' claim.",
      names="Water, Mineral Oil, Isohexadecane, Glycerin, Isopropyl Palmitate, Petrolatum, PEG-40 Sorbitan Perisostearate, Polyglyceryl-3 Diisostearate, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Sodium Hyaluronate, Tocopherol, Magnesium Sulfate, Fragrance, Citric Acid, Sodium Citrate, Potassium Sorbate"),
 dict(id="real_garnier_shampoo", file="real_garnier_shampoo.jpg", product="Garnier Fructis anti-dandruff shampoo, US Drug Facts panel, tilted bottle (1200x1600)",
      crop=dict(x=0.33, y=0.635, w=0.34, h=0.10),
      notes="Very small text on a grey bottle; 'Inactive ingredients' list only (the active, pyrithione zinc 1%, is excluded).",
      names="Water, Sodium Laureth Sulfate, Cocamide MIPA, Coco-Betaine, Glycol Distearate, Sodium Chloride, Fragrance, Dimethicone, Pyrus Malus (Apple) Fruit Extract, Sodium Benzoate, Salicylic Acid, Carbomer, Niacinamide, Pyridoxine HCl, Aloe Barbadensis Leaf Juice, Citric Acid, Linalool, Limonene, Saccharum Officinarum (Sugar Cane) Extract, Salix Nigra (Willow) Bark Extract, Guar Hydroxypropyltrimonium Chloride, Methyl Cocoate, Hexyl Cinnamal, Benzyl Alcohol, Benzyl Salicylate, Sodium Cocoate, Sodium Hydroxide, Citrus Medica Limonum (Lemon) Peel Extract, Camellia Sinensis Leaf Extract, Blue 1"),
 dict(id="real_indian_label_crop", file="real_indian_label_crop.jpg", product="Indian-market product label, flat close-up crop (500x500): ingredients + MFG addresses + barcode",
      crop=dict(x=0.0, y=0.0, w=1.0, h=0.43),
      notes="Long list with slash names, CI colorants and leakage (MFG addresses, barcode digits). Sunscreen/retinoid-type formula.",
      names="Water, Dimethicone, Glycerin, Butylene Glycol, Ammonium Acryloyldimethyltaurate/VP Copolymer, Niacinamide, Titanium Dioxide, Caprylic/Capric Triglyceride, Stearic Acid, Ethylhexyl Methoxycinnamate, Lysine Carboxymethyl Cysteinate, Hexylresorcinol, Retinyl Propionate, Ammonium Acryloyldimethyltaurate/Beheneth-25 Methacrylate Crosspolymer, Linoleamidopropyl PG-Dimonium Chloride Phosphate, Tocopheryl Acetate, Sodium PCA, Fragrance, PEG-40 Hydrogenated Castor Oil, Phenoxyethanol, Synthetic Fluorphlogopite, Polysorbate 20, Disodium EDTA, BHT, Triethanolamine, Aluminum Hydroxide, Tin Oxide, Iodopropynyl Butylcarbamate, Potassium Hydroxide, Polymethylsilsesquioxane, Diamond Powder, Alpha-Isomethyl Ionone, Benzyl Alcohol, Benzyl Benzoate, Benzyl Salicylate, Citronellol, Geraniol, Hexyl Cinnamal, Limonene, Linalool, CI 14700, CI 19140"),
 dict(id="real_derma_co_sunscreen_tube", file="real_derma_co_sunscreen_tube.jpg", product="The Derma Co sunscreen tube, India (hand-held, 450x600, small text)",
      crop=dict(x=0.34, y=0.23, w=0.36, h=0.14),
      notes="Tiny text (~6px) on a tube. Ground truth is my best reading and is the LEAST certain of the set.",
      names="Aqua, Titanium Dioxide, Ethylhexyl Methoxycinnamate, Sodium Polyacrylate, Zinc Oxide, Glycerin, Butyl Methoxydibenzoylmethane, Xylitol, Phospholipids, Caprylic Acid, Glyceryl Stearate, Dimethicone, Hyaluronic Acid, Helianthus Annuus (Sunflower) Seed Oil, 1,3-Butylene Glycol, D-Alpha Tocopheryl Acetate, C12-15 Alkyl Benzoate, Benzophenone-3, Aloe Barbadensis Leaf Juice, Ascorbic Acid, Sodium Levulinate, Phenoxyethanol, Allantoin, Melanin"),
 dict(id="real_joy_sunscreen_lotion", file="real_joy_sunscreen_lotion.jpg", product="Joy sun screen lotion bottle, India (429x600, patterned background, blurry)",
      crop=dict(x=0.14, y=0.49, w=0.52, h=0.13),
      notes="Blurry; ground truth is a partial/uncertain reading (INCI blends with (and) separators).",
      names="Water, Propylene Glycol, Glyceryl Monostearate, Stearic Acid, Isopropyl Palmitate, Cetyl Alcohol, Dimethicone, Titanium Dioxide, Triethanolamine, Cyclopentasiloxane, Phenyl Trimethicone, C12-15 Alkyl Benzoate, Ethylhexyl Methoxycinnamate, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Disodium EDTA, Glycyrrhiza Glabra (Licorice) Root Extract, Vitis Vinifera (Grape) Seed Extract, Methylparaben, Propylparaben, Parfum"),
 dict(id="real_dot_key_vitc_sunscreen_box", file="real_dot_key_vitc_sunscreen_box.jpg", product="Dot & Key Vitamin C+E sunscreen carton, India (450x600)",
      crop=dict(x=0.08, y=0.34, w=0.72, h=0.16),
      notes="Long INCI list written as blends with (and) separators; contains 'Aqua' twice and 'Water' (and) inside blends.",
      names="Aqua, Ethylhexyl Methoxycinnamate, Butyl Methoxydibenzoylmethane, Benzophenone-3, Phospholipids, 1,3-Butylene Glycol, Isododecane, Dicaprylyl Carbonate, Glycerine, Caprylic/Capric Triglyceride, Glyceryl Citrate/Lactate/Linoleate/Oleate, Propanediol, Methylene Bis-Benzotriazolyl Tetramethylbutylphenol, Decyl Glucoside, Propylene Glycol, Xanthan Gum, Polyacrylate-13, Polyisobutene, Polysorbate 20, Polyacrylate Crosspolymer-6, Titanium Dioxide, Silica, Disodium EDTA, Sodium Gluconate, Tocopheryl Acetate, Niacinamide, Ascorbyl Glucoside, Citrus Sinensis (Blood Orange) Fruit Extract, Glycerin, Water, Fructooligosaccharides, Beta Vulgaris (Beet) Root Extract, Terminalia Ferdinandiana Fruit Extract, Phenoxyethanol, Ethylhexylglycerin"),
 dict(id="real_forest_essentials_balm", file="real_forest_essentials_balm.jpg", product="Forest Essentials Ojas night balm, Ayurvedic 'Composition' list with printed percentages (500x500)",
      crop=dict(x=0.05, y=0.17, w=0.47, h=0.46),
      notes="Not an INCI list: common names with Latin binomials in parentheses, printed percentages (e.g. '- 1.0%') and '**' organic markers. The printed percentages are a label fact, not something BeautyLens infers.",
      names="Kasturi Manjal Extract (Curcuma Aromatica), Babchi Extract (Psoralea Corylifolia), Nutgrass Extract (Cyperus Rotundus), White Turmeric Extract (Curcuma Zedoaria), Licorice Extract (Glycyrrhiza Glabra), Anantmool Extract (Hemidesmus Indicus), Manjistha Extract (Rubia Cordifolia), Jatamansi Extract (Nardostachys Jatamansi), Vidanga Extract (Embelia Ribes), Jyotishmati Extract (Celastrus Paniculatus), Vetiver Extract (Vetiveria Zizanioides), Bach Extract (Acorus Calamus), Talaspatre Extract (Abies Webbiana), Haritaki Extract (Terminalia Chebula), Bibhitaki Extract (Terminalia Bellirica), Nagkesar Extract (Mesua Ferrea), Rose Bud Extract (Rosa Centifolia), Maulsari Extract (Mimusops Elengi), Arjuna Bark Extract (Terminalia Arjuna), Kalonji Extract (Nigella Sativa), Kallijiri Extract (Vernonia Anthelmintica), Cardamom Extract (Elettaria Cardamomum), Nutmeg Extract (Myristica Officinalis), Neem Extract (Azadirachta Indica), Coconut Milk (Cocos Nucifera), Fermented Sweet Almond Kernel Oil (Prunus Amygdalus Dulcis), Fermented Argan Oil (Argania Spinosa), Fermented Sunflower Seed Oil (Helianthus Annuus), Fermented Moringa Seed Oil (Moringa Oleifera), Cow's Milk, Tamra Bhasma (Purified Ash Of Copper), Vitamin E (Tocopheryl Acetate), Yasad Bhasma (Purified Ash Of Zinc), Ceramide III, Cocoa Seed Butter (Theobroma Cacao), Bees Wax (Cera Alba)"),
]
out = []
for p in PHOTOS:
    names = [n.strip() for n in p.pop("names").split(", ")]
    # split_top_level: names contain no commas inside parentheses, so a plain split is safe here
    expected = []
    for n in names:
        k = key(without_parens(n))
        in_dict = bool(D.exact(k) or D.alias(k))
        cat = classify(n) or classify(without_parens(n))
        e = {"raw": n, "covered": in_dict or bool(cat)}
        if in_dict:
            e["inci"] = (D.exact(k) or D.alias(k)).inci_name
        elif cat:
            e["inci"] = None; e["category"] = cat
        else:
            e["inci"] = n.upper(); e["note"] = "not in the seed dictionary (coverage gap, not an OCR error)"
        expected.append(e)
    p.update(synthetic=False, truth_verified=False, degradations=[], part="all",
             truth_text="INGREDIENTS: " + ", ".join(names), expected=expected)
    out.append(p)
json.dump(out, open(ROOT / "backend/fixtures/photos/real/index.json", "w"), indent=1, ensure_ascii=False)
for p in out:
    cov = sum(e["covered"] for e in p["expected"])
    print(f"{p['id']:30s} {len(p['expected']):2d} ingredients, {cov:2d} covered by seed dictionary/categories")
