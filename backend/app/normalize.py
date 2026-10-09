"""B1 normalization (deterministic): NFKC, hyphenated line-break rejoin, separator split respecting
parentheses, "may contain"/+- sections, (nano) markers. Raw text and order are kept for every segment."""
from __future__ import annotations
import re, unicodedata
from dataclasses import dataclass, field


@dataclass
class Segment:
    raw: str                 # text as received for this segment (after NFKC + hyphen rejoin only)
    source_index: int
    position: int            # running position across all segments (for restore)
    optional: bool = False
    tags: list[str] = field(default_factory=list)
    ocr_conf: float | None = None


_LABEL = re.compile(r"^\s*(?:ingredients?|ingredientes|inci)\s*(?:\(inci\))?\s*[:\-]?\s*", re.I)
_MAYCONTAIN = re.compile(r"^\s*(?:may\s+contain|\+\s*/\s*-|\+/-|±)\s*[:\-]?\s*", re.I)
_NANO = re.compile(r"\(\s*nano\s*\)", re.I)
# a period is a separator only when it is followed by a capital letter or '+' (lost-comma / sentence boundary)
_PERIOD_SPLIT = re.compile(r"\.\s+(?=[A-Z+])")
# pieces that start with a label like "B.NO. X" / "Mfg. Date" are one field: do not cut at their periods
_FIELD_LABEL = re.compile(r"^(?:MRP|M\.R\.P|B\.?\s?NO|BATCH|LOT|MFG|MFD|EXP|USE BEFORE|BEST BEFORE|PAO)\b", re.I)


def clean_text(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).replace("­", "")
    s = re.sub(r"-\s*\r?\n\s*", "", s)           # rejoin hyphenated line breaks: "Homo-\nsalate" -> "Homosalate"
    s = re.sub(r"\s*\r?\n\s*", " ", s)
    s = s.replace("•", ",").replace("·", ",").replace("、", ",")
    return re.sub(r"[ \t]+", " ", s).strip()


def split_top_level(s: str) -> list[str]:
    out, depth, cur = [], 0, []
    for ch in s:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch in ",;" and depth == 0:
            out.append("".join(cur)); cur = []
        else:
            cur.append(ch)
    out.append("".join(cur))
    return out


def segment(tokens: list[tuple[int, str, float | None]]) -> list[Segment]:
    segs: list[Segment] = []
    pos = 0
    for src, raw, conf in tokens:
        text = clean_text(raw)
        text = _LABEL.sub("", text, count=1)
        optional_run = False
        for piece in split_top_level(text):
            parts = [piece] if _FIELD_LABEL.match(piece.strip()) else _PERIOD_SPLIT.split(piece)
            for part in parts:
                part = part.strip().strip(".").strip()
                if not part:
                    continue
                opt = optional_run
                m = _MAYCONTAIN.match(part)
                if m:
                    optional_run = opt = True
                    part = part[m.end():].strip()
                    if not part:
                        continue
                tags = []
                if _NANO.search(part):
                    tags.append("nano")
                segs.append(Segment(part, src, pos, optional=opt, tags=tags, ocr_conf=conf))
                pos += 1
    return segs


def strip_decorations(raw: str) -> str:
    """Text used for dictionary matching: (nano) marker removed; parentheses kept (handled by callers)."""
    return _NANO.sub("", raw).strip()


def without_parens(raw: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", raw).strip()
