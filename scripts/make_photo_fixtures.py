#!/usr/bin/env python3
"""Generate SYNTHETIC label-photo fixtures (backend/fixtures/photos/*.jpg + index.json), seeded and repeatable.

The ground-truth ingredient text of each source fixture is rendered onto a label-like image and degraded
(cylindrical bottle warp, blur, glare, noise, rotation, low resolution). These are NOT real photos: they measure
robustness to those degradations only. Real photos can be added to the same folder and listed in index.json.
Usage: python scripts/make_photo_fixtures.py
"""
import json, random
from pathlib import Path
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "backend/fixtures/labels"
OUT = ROOT / "backend/fixtures/photos"
FONTS = {"sans": "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "lib": "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
         "serif": "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"}

# (photo id, source fixture, font, size, upper, degradations, part)   part: "all" | "first" | "last" (for multi-photo merge)
PHOTOS = [
    ("g_clean", "cetaphil_moisturising_lotion_ocr", "lib", 30, True, ["noise"], "all"),
    ("g_combo", "cetaphil_moisturising_lotion_ocr", "lib", 30, True, ["curve", "glare", "blur1", "rot5", "noise"], "all"),
    ("g_curve", "cetaphil_moisturising_lotion_ocr", "sans", 28, True, ["curve", "noise"], "all"),
    ("cleanser_clean", "ref_gentle_cleanser", "sans", 28, True, ["noise"], "all"),
    ("serum_blur", "ref_niacinamide_serum", "lib", 28, False, ["blur2", "noise"], "all"),
    ("spf_glare", "ref_sunscreen_spf50", "lib", 28, False, ["glare", "noise"], "all"),
    ("mineral_curve", "ref_mineral_sunscreen", "sans", 28, False, ["curve", "rot3", "noise"], "all"),
    ("shampoo_lowres", "ref_shampoo", "lib", 30, True, ["lowres"], "all"),
    ("toner_combo", "ref_aha_toner", "serif", 28, False, ["curve", "glare", "blur1", "noise"], "all"),
    ("lip_rot", "ref_lip_balm", "lib", 28, False, ["rot6", "noise"], "all"),
    ("foundation_curve", "ref_foundation", "lib", 28, False, ["curve", "blur1", "noise"], "all"),
    ("hair_clean", "ref_hair_oil_indian", "sans", 28, False, ["noise"], "all"),
    # bad photos: for the quality-guidance check
    ("bad_blur", "ref_gentle_cleanser", "sans", 28, True, ["blur5", "noise"], "all"),
    ("bad_glare", "ref_shampoo", "lib", 30, True, ["bigglare", "noise"], "all"),
    ("bad_lowres", "ref_aha_toner", "lib", 30, False, ["tiny"], "all"),
    # multi-photo pairs (overlapping halves of the same label, shot differently)
    ("pair_g_a", "cetaphil_moisturising_lotion_ocr", "lib", 30, True, ["curve", "blur1", "noise"], "first"),
    ("pair_g_b", "cetaphil_moisturising_lotion_ocr", "lib", 30, True, ["glare", "rot3", "noise"], "last"),
    ("pair_sh_a", "ref_shampoo", "lib", 30, True, ["blur1", "noise"], "first"),
    ("pair_sh_b", "ref_shampoo", "lib", 30, True, ["curve", "noise"], "last"),
]


def truth_entries(fx, part):
    ents = fx["expected"]
    n = len(ents)
    if part == "first":
        return ents[: int(round(n * 0.65))]
    if part == "last":
        return ents[n - int(round(n * 0.65)):]
    return ents


def clean_name(e):
    """Text actually printed on the synthetic label for an expected entry."""
    if e.get("inci") and "category" not in e:
        return e["inci"] if e["raw"].isupper() or "+" in e["raw"] else e["raw"]
    raw = e["raw"]
    return raw.replace("May Contain: ", "").replace("+/- ", "")


def render(text, font_path, size, width=1000):
    font = ImageFont.truetype(font_path, size)
    img = Image.new("RGB", (width, 40), (244, 240, 230))
    d = ImageDraw.Draw(img)
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) > width - 120:
            lines.append(cur); cur = w
        else:
            cur = t
    lines.append(cur)
    h = int(size * 1.5) * len(lines) + 120
    img = Image.new("RGB", (width, h), (244, 240, 230))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, width, 22], fill=(34, 87, 60))  # green band: label-like background structure
    y = 60
    for ln in lines:
        d.text((60, y), ln, font=font, fill=(35, 35, 40))
        y += int(size * 1.5)
    return np.array(img)


def cylinder(img, strength=0.85):
    h, w = img.shape[:2]
    cx, R = w / 2, w / (2 * strength)
    xs = np.arange(w, dtype=np.float32)
    src_x = cx + R * np.arcsin(np.clip((xs - cx) / R, -0.999, 0.999))  # sample further out toward the edges: text compresses like on a bottle
    map_x = np.tile(src_x, (h, 1)).astype(np.float32)
    scale = 1 + 0.25 * (np.abs(xs - cx) / cx) ** 2           # vertical stretch/shrink toward edges (perspective of a bottle)
    yy = np.arange(h, dtype=np.float32)[:, None]
    map_y = (h / 2 + (yy - h / 2) * scale[None, :]).astype(np.float32) + 6 * np.sin(np.pi * xs / w)[None, :]
    return cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderValue=(244, 240, 230))


def glare(img, rng, big=False):
    h, w = img.shape[:2]
    cx, cy = rng.uniform(0.25, 0.75) * w, rng.uniform(0.25, 0.75) * h
    sx, sy = (0.35 if big else 0.14) * w, (0.40 if big else 0.18) * h
    yy, xx = np.mgrid[0:h, 0:w]
    g = np.exp(-(((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2))
    a = np.clip(g * (1.6 if big else 1.25), 0, 1)[..., None]
    return (img * (1 - a) + 255 * a).astype(np.uint8)


def rotate(img, deg):
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    return cv2.warpAffine(img, M, (w, h), borderValue=(244, 240, 230))


def degrade(img, ops, rng):
    for op in ops:
        if op == "curve": img = cylinder(img)
        elif op == "glare": img = glare(img, rng)
        elif op == "bigglare": img = glare(img, rng, big=True)
        elif op.startswith("blur"): s = float(op[4:]); img = cv2.GaussianBlur(img, (0, 0), s)
        elif op.startswith("rot"): img = rotate(img, float(op[3:]))
        elif op == "lowres": img = cv2.resize(img, None, fx=0.42, fy=0.42, interpolation=cv2.INTER_AREA)
        elif op == "tiny": img = cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
        elif op == "noise": img = np.clip(img.astype(np.float32) + rng.normal(0, 5, img.shape), 0, 255).astype(np.uint8)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for pid, src, font, size, upper, ops, part in PHOTOS:
        fx = json.load(open(FIX / f"{src}.json"))
        ents = truth_entries(fx, part)
        names = [clean_name(e) for e in ents]
        text = "INGREDIENTS: " + ", ".join(names)
        text = text.upper() if upper else text
        rng = np.random.default_rng(sum(map(ord, pid)))  # deterministic per photo id
        img = degrade(render(text, FONTS[font], size), ops, rng)
        path = OUT / f"{pid}.jpg"
        Image.fromarray(img).save(path, quality=88)
        index.append({"id": pid, "file": path.name, "source_fixture": src, "synthetic": True, "degradations": ops, "part": part,
                      "font": font, "size": size, "truth_text": text,
                      "expected": [dict(e) for e in ents]})
    # merge targets: no image; ground truth is the FULL ingredient list that the overlapping photos together cover
    for mid, src, upper in [("merged_g", "cetaphil_moisturising_lotion_ocr", True), ("merged_sh", "ref_shampoo", True)]:
        fx = json.load(open(FIX / f"{src}.json"))
        text = "INGREDIENTS: " + ", ".join(clean_name(e) for e in fx["expected"])
        index.append({"id": mid, "file": None, "source_fixture": src, "synthetic": True, "degradations": ["merge-target"], "part": "all",
                      "truth_text": text.upper() if upper else text, "expected": [dict(e) for e in fx["expected"]]})
    json.dump(index, open(OUT / "index.json", "w"), indent=1, ensure_ascii=False)
    print(f"wrote {len(index)} synthetic photos to {OUT}")


if __name__ == "__main__":
    main()
