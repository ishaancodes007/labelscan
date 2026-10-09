"""B5 non-ingredient filter. Strong patterns run before dictionary lookup; the weak marketing heuristic
only runs on text the dictionary could not match."""
import re

_NUM = r"\d[\d,.]*"
STRONG: list[tuple[str, str, re.Pattern]] = [
    ("price", "price", re.compile(rf"\b(?:MRP|M\.R\.P|Rs\.?|INR|₹|\$|€|£)\s*{_NUM}|{_NUM}\s*/\s*(?:ml|g|gm|oz)\b|\binclusive of (?:all )?taxes", re.I)),
    ("batch code", "batch", re.compile(r"\b(?:B\.?\s?NO\.?|BATCH(?:\s*(?:NO\.?|CODE))?|LOT(?:\s*NO\.?)?)\s*[:#]?\s*[A-Z0-9-]{3,}", re.I)),
    ("date", "date", re.compile(r"\b(?:MFG|MFD|MANUFACTURED|EXP|EXPIRY|USE BEFORE|USE BY|BEST BEFORE|BB)\b.{0,20}\d|\b\d{1,2}\s*/\s*\d{2,4}\b", re.I)),
    ("product/packaging code", "code", re.compile(r"^(?:[A-Z]{2,5}\s?\d{5,}|\d{8,14})$")),
    ("directions", "directions", re.compile(r"\b(?:shake well|apply|use (?:daily|twice|as directed)|directions?|keep out of|keep away|for external use|avoid contact|discontinue|do not (?:use|swallow|ingest)|store (?:in|below|at)|patch test|rinse off)\b", re.I)),
    ("packaging copy", "packaging", re.compile(r"\b(?:made in|manufactured by|mfd\.? by|marketed by|imported by|net\s*(?:wt|weight|content|qty|quantity)|net contents|customer care|toll free|www\.|https?://|@\w+\.\w+|barcode)\b|\b\d+(?:\.\d+)?\s?(?:ml|fl\.? ?oz|g|gm|oz)\b", re.I)),
]
MARKETING_WORDS = {"THE", "WITH", "FOR", "YOUR", "SKIN", "HAIR", "FEEL", "DAYS", "PROVEN", "TESTED", "CLINICALLY", "DERMATOLOGIST",
                   "DERMATOLOGICALLY", "FREE", "NEW", "GENTLE", "ADVANCED", "FORMULA", "HELPS", "RESTORES", "BARRIER", "MOISTURE", "RESULTS", "WEEK", "WEEKS"}


def strong(text: str) -> tuple[str, str] | None:
    for reason, kind, rx in STRONG:
        if rx.search(text):
            return reason, kind
    return None


def weak_marketing(text: str) -> tuple[str, str] | None:
    words = re.findall(r"[A-Za-z]+", text.upper())
    if len(words) >= 4 and sum(w in MARKETING_WORDS for w in words) >= 2:
        return "marketing or descriptive copy", "marketing"
    return None
