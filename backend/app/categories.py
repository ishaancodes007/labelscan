"""Category recognition: valid ingredient classes that have no single-compound dictionary record."""
import re

_BOT_PART = r"(?:(?:AERIAL PARTS|WHOLE PLANT|SEED|LEAF|FRUIT|ROOT|FLOWER|BARK|STEM|PEEL|KERNEL|BUD|CONE|RHIZOME|HERB|FLOWER/LEAF/STEM|BULB|NUT|PULP|SHELL)\s+)*"
BOTANICAL = re.compile(
    rf"^[A-Za-z]{{3,}}\s+[A-Za-z]{{3,}}(?:\s*\([^)]*\))?\s+{_BOT_PART}(?:EXTRACT|OIL|WATER|BUTTER|WAX|JUICE|POWDER|GUM|FLOWER WATER|FERMENT|FERMENT FILTRATE)$",
    re.I)
POLYMER = re.compile(r"(?:\b|/)(?:CROSSPOLYMER|COPOLYMER|POLYMER)$", re.I)
FRAGRANCE = re.compile(r"^(?:PARFUM|FRAGRANCE|AROMA|FLAVOR)(?:\s*[/(]\s*(?:PARFUM|FRAGRANCE|AROMA)\)?)?$", re.I)
COLORANT = re.compile(r"^(?:CI\s?\d{5}(?::\d)?|(?:EXT\.?\s*)?(?:FD&C|D&C)\s+(?:BLUE|RED|YELLOW|GREEN|ORANGE|VIOLET)\s*(?:NO\.?\s*)?\d+\s*(?:LAKE)?)$", re.I)

NOTE = "Valid ingredient class; no single compound record expected."


def classify(text: str) -> str | None:
    t = text.strip().rstrip(".")
    if FRAGRANCE.match(t):
        return "fragrance"
    if COLORANT.match(t):
        return "colorant"
    if POLYMER.search(t):
        return "polymer"
    if BOTANICAL.match(t):
        return "botanical"
    return None
