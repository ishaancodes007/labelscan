#!/usr/bin/env python3
"""Fetch the CONSOLIDATED Regulation (EC) No 1223/2009 from the EU Publications Office (Cellar) and derive data/regulation_1223_annexes.json:
the entries of Annex III (restricted substances), IV (colourants), V (preservatives) and VI (UV filters) with their official glossary names,
CAS numbers and conditions, plus the Annex II (prohibited) entries whose INCI name can be identified.

  python scripts/fetch_regulation.py             # latest consolidated version
The raw 3.9 MB XHTML goes to backend/data/raw/ (git-ignored); only the derived JSON is committed.
Reuse: EU legal acts are published for reuse with acknowledgement of the source (Commission Decision 2011/833/EU); confirm the current legal notice.
Entry wording is shortened to 600 characters; the Regulation is the authority, not this file."""
import csv, hashlib, json, re, sys, urllib.parse, urllib.request, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.dictionary import key  # noqa: E402

RAW = ROOT / "backend/data/raw"
OUT = ROOT / "data/regulation_1223_annexes.json"
SPARQL = "https://publications.europa.eu/webapi/rdf/sparql"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


def loc(url, headers):
    try:
        urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url, headers=headers), timeout=60)
    except urllib.error.HTTPError as e:
        return e.headers.get("Location", "").replace("http://", "https://")


def retry(fn, tries=4):
    import time
    for n in range(tries):
        try:
            return fn()
        except Exception as e:      # transient network/service errors
            if n == tries - 1: raise
            print(f"retry {n + 1}/{tries - 1} after {type(e).__name__}", file=sys.stderr); time.sleep(3 * (n + 1))


def latest_consolidated():
    q = 'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> SELECT ?w ?celex WHERE { ?w cdm:resource_legal_id_celex ?celex . FILTER(STRSTARTS(STR(?celex), "02009R1223")) } ORDER BY DESC(?celex) LIMIT 1'
    r = urllib.request.Request(SPARQL + "?" + urllib.parse.urlencode({"query": q}), headers={"Accept": "application/sparql-results+json"})
    b = retry(lambda: json.load(urllib.request.urlopen(r, timeout=120)))["results"]["bindings"][0]
    return b["celex"]["value"], b["w"]["value"].rsplit("/", 1)[1]


def cells(r): return [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, flags=re.S)]


def main():
    celex, work = latest_consolidated()
    cached = RAW / f"reg1223_{celex}.xhtml"
    doc = "(cached) " + str(cached) if "--offline" in sys.argv and cached.exists() else retry(lambda: loc(f"https://publications.europa.eu/resource/cellar/{work}", {"Accept": "application/xhtml+xml", "Accept-Language": "eng"}))
    if doc.startswith("(cached)"):
        raw = cached.read_bytes(); doc = f"https://publications.europa.eu/resource/cellar/{work}"
    else:
        raw = retry(lambda: urllib.request.urlopen(urllib.request.Request(doc, headers={"Accept": "application/xhtml+xml"}), timeout=180).read())
        RAW.mkdir(parents=True, exist_ok=True); cached.write_bytes(raw)
    text = raw.decode("utf-8", "replace")
    G = {key(r["common_ingredient_name"]): r["common_ingredient_name"].strip().upper() for r in csv.DictReader(open(RAW / "glossary_32025D1175.csv", encoding="utf-8"))}

    def inci_names(cell):
        if key(cell) in G: return [G[key(cell)]]
        found, w, i = [], cell.split(), 0
        for part in re.split(r"[;,]", cell):               # comma/semicolon separated names
            if key(part) in G: found.append(G[key(part)])
        while i < len(w):                                    # plus longest consecutive word spans (names separated by spaces only)
            hit = None
            for j in range(len(w), i, -1):
                if key(" ".join(w[i:j])) in G: hit = (j, G[key(" ".join(w[i:j]))]); break
            if hit: found.append(hit[1]); i = hit[0]
            else: i += 1
        return list(dict.fromkeys(found))

    tabs = [m.start() for m in re.finditer("<table", text)]
    tables = []
    for t in tabs:
        seg = text[t: text.find("</table>", t)]
        tables.append([cells(r) for r in re.findall(r"<tr[^>]*>(.*?)</tr>", seg, flags=re.S)])

    def find(first_header):
        for t in tables:
            if t and t[0] and t[0][0] == "Reference number" and first_header in " ".join(t[0]): return t
    def annex(tab, glossary_col=2, cond_from=5):
        out = []
        for r in tab:
            if not r or not re.fullmatch(r"\d+[a-z]?", r[0].strip()) or len(r) < 4: continue
            names = inci_names(r[glossary_col]) if len(r) > glossary_col else []
            cond = " | ".join(c for c in r[cond_from:] if c)[:600]
            out.append({"entry": r[0].strip(), "inci": names, "cell": r[glossary_col][:160] if len(r) > glossary_col else "", "cas": r[3][:80] if len(r) > 3 else "", "conditions": cond})
        return out

    all_tabs = [t for t in tables if t and t[0] and t[0][0] == "Reference number"]
    # order in the Regulation: II (prohibited), III, IV, V, VI
    a2, a3, a4, a5, a6 = all_tabs[0], all_tabs[1], all_tabs[2], all_tabs[3], all_tabs[4]
    data = {"meta": {"source": "Regulation (EC) No 1223/2009, consolidated version", "celex": celex, "cellar_work": work, "document_url": doc,
                     "retrieved": datetime.date.today().isoformat(), "sha256_xhtml": hashlib.sha256(raw).hexdigest(),
                     "note": "Derived dataset for BeautyLens. Names are mapped to the official glossary (Implementing Decision (EU) 2025/1175). Conditions are shortened; the Regulation is the authority."},
            "annexes": {"III": annex(a3), "IV": annex(a4, 1, 4), "V": annex(a5), "VI": annex(a6)}}
    # Annex II: keep entries whose cell lists a glossary INCI name (e.g. 'cis-CTAC, quaternium-15', '(INCI: Isopropylparaben)')
    a2e = []
    for r in a2:
        if not r or not re.fullmatch(r"\d+[a-z]?", r[0].strip()) or len(r) < 2: continue
        names = [m.strip().upper() for m in re.findall(r"INCI:\s*([A-Za-z0-9 ,\-/.]+?)\)", r[1])] if "INCI:" in r[1] else []
        names += [G[key(p)] for p in re.split(r"[;,]", r[1]) if key(p) in G and len(key(p)) >= 8]
        if names: a2e.append({"entry": r[0].strip(), "inci": list(dict.fromkeys(names)), "cell": r[1][:160]})
    data["annexes"]["II_prohibited_identified"] = a2e
    # the formaldehyde-release labelling note of Annex V
    for t in tables:
        if len(t) == 1 and t[0] and "release formaldehyde" in " ".join(t[0]): data["annex_v_formaldehyde_note"] = " ".join(t[0])[:700]
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    print({k: len(v) for k, v in data["annexes"].items()}, "->", OUT, f"({OUT.stat().st_size // 1024} KB)")
    # sanity checks against known entries
    v = {e["entry"]: e for e in data["annexes"]["V"]}
    assert "PHENOXYETHANOL" in v["29"]["inci"] and "BENZYL ALCOHOL" in v["34"]["inci"], "Annex V parse looks wrong"


if __name__ == "__main__":
    main()
