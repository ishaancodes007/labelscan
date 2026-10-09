"""Local INCI dictionary (SQLite). Built by scripts/import_cosing.py; auto-built from the seed list if missing."""
from __future__ import annotations
import csv, os, re, sqlite3, unicodedata
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = Path(os.environ.get("INCI_DB_PATH", ROOT / "data" / "inci.sqlite"))
SEED_CSV = ROOT / "data" / "seed_inci.csv"

SCHEMA = """
CREATE TABLE inci(inci_name TEXT PRIMARY KEY, normalized TEXT, cas TEXT, ec TEXT, functions TEXT,
                  description TEXT, cosing_ref TEXT, category TEXT);
CREATE INDEX inci_norm ON inci(normalized);
CREATE TABLE aliases(alias TEXT, normalized TEXT, inci_name TEXT, kind TEXT);
CREATE INDEX alias_norm ON aliases(normalized);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
"""


def key(s: str) -> str:
    """Matching key: NFKC, uppercase, only A-Z 0-9 kept ('?' kept as OCR wildcard)."""
    s = unicodedata.normalize("NFKC", s).upper()
    return re.sub(r"[^A-Z0-9?]", "", s)


def build_db(db_path: Path, rows: list[dict], meta: dict[str, str]) -> int:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    seen: set[str] = set()
    for r in rows:
        name = r["inci_name"].strip().upper()
        if not name or name in seen:
            continue
        seen.add(name)
        con.execute("INSERT INTO inci VALUES(?,?,?,?,?,?,?,?)",
                    (name, key(name), r.get("cas") or None, r.get("ec") or None, r.get("functions") or None,
                     r.get("description") or None, r.get("cosing_ref") or None, r.get("category") or None))
        for a in r.get("aliases", []):
            con.execute("INSERT INTO aliases VALUES(?,?,?,?)", (a["alias"].upper(), key(a["alias"]), name, a["kind"]))
    for k, v in meta.items():
        con.execute("INSERT INTO meta VALUES(?,?)", (k, v))
    con.commit(); con.close()
    return len(seen)


def load_seed_rows() -> list[dict]:
    rows = []
    with open(SEED_CSV, encoding="utf-8") as f:
        lines = [l for l in f if not l.startswith("#")]
    for r in csv.DictReader(lines, delimiter="|"):
        aliases = []
        for part in (r.get("aliases") or "").split(";"):
            if ":" in part:
                a, kind = part.rsplit(":", 1)
                aliases.append({"alias": a.strip(), "kind": kind.strip()})
        rows.append({"inci_name": r["inci_name"], "category": r.get("category") or None, "aliases": aliases})
    return rows


def build_seed_db(db_path: Path = DEFAULT_DB) -> int:
    return build_db(db_path, load_seed_rows(), {
        "dictionaryVersion": "seed-1", "dictionarySource": "seed",
        "dictionarySourceDate": "", "note": "hand-written seed list; not CosIng",
    })


@dataclass
class Entry:
    inci_name: str
    category: str | None
    cas: str | None
    ec: str | None
    alias_kind: str | None = None  # set when found through an alias


class Dictionary:
    def __init__(self, db_path: Path | None = None):
        db_path = Path(db_path or DEFAULT_DB)
        if not db_path.exists():
            build_seed_db(db_path)
        self.con = sqlite3.connect(db_path, check_same_thread=False)
        self.meta = dict(self.con.execute("SELECT key,value FROM meta"))
        self.by_key: dict[str, Entry] = {}
        self.alias_key: dict[str, Entry] = {}
        for name, norm, cas, ec, cat in self.con.execute("SELECT inci_name,normalized,cas,ec,category FROM inci"):
            self.by_key[norm] = Entry(name, cat, cas, ec)
        for alias, norm, name, kind in self.con.execute("SELECT alias,normalized,inci_name,kind FROM aliases"):
            base = self.by_key.get(key(name))
            self.alias_key.setdefault(norm, Entry(name, base.category if base else None,
                                                  base.cas if base else None, base.ec if base else None, kind))
        # fuzzy corpus: every INCI key and alias key -> inci_name
        self.corpus: dict[str, str] = {k: e.inci_name for k, e in self.by_key.items()}
        for k, e in self.alias_key.items():
            self.corpus.setdefault(k, e.inci_name)
        self.corpus_keys = list(self.corpus)
        # vocabulary of whole words used in dictionary names (for the "different ingredient word" warning)
        self.vocab: set[str] = set()
        for name in set(self.corpus.values()):
            self.vocab.update(re.findall(r"[A-Z0-9]{3,}", name))

    @property
    def source(self) -> str:
        return self.meta.get("dictionarySource", "seed")

    def exact(self, k: str) -> Entry | None:
        return self.by_key.get(k)

    def alias(self, k: str) -> Entry | None:
        return self.alias_key.get(k)
