"""PubChem PUG-REST client: identity confirmation only (CAS -> name -> autocomplete). Cached, rate-limited
(<=5 requests/second, PubChem's published limit), with a circuit breaker so an outage never blocks analysis.
Response shapes: name->cids {"IdentifierList":{"CID":[..]}}; autocomplete {"dictionary_terms":{"compound":[..]}}."""
from __future__ import annotations
import re, threading, time
from dataclasses import dataclass
import httpx

BASE = "https://pubchem.ncbi.nlm.nih.gov/rest"
CAS_RX = re.compile(r"^\d{2,7}-\d{2}-\d$")


@dataclass
class PubChemResult:
    status: str                       # match | ambiguous | not_found | unavailable
    cid: int | None = None
    names: list[str] | None = None    # autocomplete suggestions when ambiguous
    via: str | None = None            # cas | name | autocomplete


class PubChemClient:
    def __init__(self, enabled: bool = True, timeout: float = 3.0, client: httpx.Client | None = None):
        self.enabled = enabled
        self.http = client or httpx.Client(timeout=timeout, headers={"User-Agent": "BeautyLens/0.1 (identity lookup)"})
        self.cache: dict[str, PubChemResult] = {}
        self._lock = threading.Lock()
        self._last = 0.0
        self._fails = 0
        self._open_until = 0.0
        self.calls = 0

    @property
    def state(self) -> str:
        if not self.enabled:
            return "off"
        return "unavailable" if time.time() < self._open_until or self._fails >= 2 else "on"

    def _get(self, path: str) -> httpx.Response | None:
        with self._lock:
            wait = 0.2 - (time.time() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.time()
        for attempt in range(3):  # retry throttling/5xx with backoff (1s, 2s) before giving up
            self.calls += 1
            try:
                r = self.http.get(f"{BASE}{path}")
                if r.status_code not in (429, 500, 502, 503, 504):
                    self._fails = 0
                    return r
            except httpx.HTTPError:
                pass
            if attempt < 2:
                time.sleep(1.0 * (attempt + 1))
        self._fails += 1
        if self._fails >= 2:
            self._open_until = time.time() + 60
        return None

    def lookup(self, name: str) -> PubChemResult:
        if not self.enabled:
            return PubChemResult("unavailable")
        k = name.strip().upper()
        if k in self.cache:
            return self.cache[k]
        if time.time() < self._open_until:
            return PubChemResult("unavailable")
        res = self._lookup(name.strip())
        if res.status != "unavailable":
            self.cache[k] = res
        return res

    def _cids(self, kind: str, q: str) -> tuple[bool, int | None]:
        r = self._get(f"/pug/compound/{kind}/{q}/cids/JSON")
        if r is None:
            return False, None
        if r.status_code == 404:
            return True, None
        try:
            cids = r.json().get("IdentifierList", {}).get("CID", [])
        except ValueError:
            return False, None
        return True, (cids[0] if cids and cids[0] else None)

    def _lookup(self, name: str) -> PubChemResult:
        from urllib.parse import quote
        q = quote(name, safe="")
        if CAS_RX.match(name):
            ok, cid = self._cids("name", q)  # PubChem resolves CAS numbers as synonyms
            if not ok:
                return PubChemResult("unavailable")
            if cid:
                return PubChemResult("match", cid, via="cas")
        ok, cid = self._cids("name", q)
        if not ok:
            return PubChemResult("unavailable")
        if cid:
            return PubChemResult("match", cid, via="name")
        r = self._get(f"/autocomplete/compound/{q}/json?limit=5")
        if r is None:
            return PubChemResult("unavailable")
        try:
            terms = r.json().get("dictionary_terms", {}).get("compound", [])
        except ValueError:
            return PubChemResult("unavailable")
        # autocomplete is loose (it returns unrelated names for garbage): keep only close lexical matches
        from rapidfuzz import fuzz
        close = [t for t in terms if fuzz.ratio(name.upper(), t.upper()) >= 75]
        if not close:
            return PubChemResult("not_found")
        return PubChemResult("ambiguous", names=close[:5], via="autocomplete")
