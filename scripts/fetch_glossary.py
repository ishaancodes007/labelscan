#!/usr/bin/env python3
"""Download the official EU glossary of common ingredient names (Commission Implementing Decision (EU) 2025/1175, OJ L, 10.7.2025)
from the EU Publications Office (Cellar) and extract it to CSV. Repeatable; the raw 10 MB XHTML is NOT committed (git-ignored).

  python scripts/fetch_glossary.py                    # default CELEX 32025D1175
  python scripts/fetch_glossary.py --celex 32022D0677 # an older version of the glossary

What the glossary contains: ~30,400 rows of (entry number, common ingredient name). It has NO CAS/EC numbers and NO functions;
those live only in the per-substance CosIng web database, which offers no bulk export (do not crawl it).
Reuse: EU legal acts are published by the Publications Office for reuse with acknowledgement of the source (Commission Decision
2011/833/EU on the reuse of Commission documents); confirm the current legal notice before redistributing."""
import argparse, csv, hashlib, json, re, sys, urllib.request, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "backend" / "data" / "raw"


def get(url, headers):
    req = urllib.request.Request(url, headers=headers)
    return urllib.request.urlopen(req, timeout=120).read()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--celex", default="32025D1175"); a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    # 1) CELEX -> Cellar work id (the service answers with a 303 to .../cellar/<uuid>/rdf/...; urllib follows it, so ask for the id explicitly)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kw): return None
    op = urllib.request.build_opener(NoRedirect)
    try:
        op.open(urllib.request.Request(f"https://publications.europa.eu/resource/celex/{a.celex}", headers={"Accept": "application/xhtml+xml", "Accept-Language": "eng"}), timeout=60)
    except urllib.error.HTTPError as e:
        loc = e.headers.get("Location", "")
    m = re.search(r"cellar/([0-9a-f-]{36})", loc)
    if not m: sys.exit(f"could not resolve CELEX {a.celex}: {loc!r}")
    work = m.group(1)
    # 2) content negotiation to the English XHTML manifestation
    try:
        op.open(urllib.request.Request(f"https://publications.europa.eu/resource/cellar/{work}", headers={"Accept": "application/xhtml+xml", "Accept-Language": "eng"}), timeout=60)
    except urllib.error.HTTPError as e:
        doc = e.headers.get("Location", "").replace("http://", "https://")
    raw = get(doc, {"Accept": "application/xhtml+xml"})
    text = raw.decode("utf-8")
    # 3) the glossary is the big table with header "Entry | Common Ingredient name"
    tables = [t.start() for t in re.finditer("<table", text)]
    best = None
    for t in tables:
        seg = text[t: text.find("</table>", t)]
        if "Common Ingredient name" in seg[:3000]:
            best = seg; break
    if not best: sys.exit("glossary table not found")
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", best, flags=re.S)
    names = []
    for r in rows:
        c = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", r, flags=re.S)]
        if len(c) == 2 and c[0].isdigit() and c[1]:
            names.append((int(c[0]), c[1]))
    csv_path = OUT / f"glossary_{a.celex}.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["entry", "common_ingredient_name"]); w.writerows(names)
    meta = {"celex": a.celex, "cellar_work": work, "document_url": doc, "retrieved": datetime.date.today().isoformat(),
            "sha256_xhtml": hashlib.sha256(raw).hexdigest(), "rows": len(names)}
    (OUT / f"glossary_{a.celex}.json").write_text(json.dumps(meta, indent=1))
    print(f"wrote {len(names)} names -> {csv_path}\n{json.dumps(meta, indent=1)}")


if __name__ == "__main__":
    main()
