"""Identity resolver: normalize -> filter -> ladder -> merge/split -> PubChem -> fuzzy. Identity only; no rules, no safety."""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from rapidfuzz import fuzz, process

from . import categories, filter as nf
from .dictionary import Dictionary, key
from .models import Candidate, Meta, RemovedFragment, ResolvedItem, ResolveRequest, ResolveResponse
from .normalize import Segment, segment, strip_decorations, without_parens
from .ocr_confusion import score_candidate
from .pubchem import PubChemClient

# Calibrated in scripts/resolution_report.py --sweep (see backend/README.md for the numbers and their limits).
THRESHOLDS = {
    "high_score": 0.80,      # top-1 score needed to flag a suggestion high_confidence
    "high_margin": 0.08,     # top-1 minus top-2 score
    "max_unexplained": 1,    # edits not explained by look-alike glyphs / narrow-glyph drops
    "dominant_score": 0.85, "dominant_margin": 0.25,  # very dominant candidate: high-confidence even with unexplained edits
    "suggest_floor": 0.55,   # below this a fuzzy candidate is not shown
    "merge_score": 0.75, "merge_gain": 0.10,
    "split_min": 0.60, "split_gain": 0.10,
}


@dataclass
class State:
    seg: Segment
    fragments: list[str]
    status: str = "pending"          # pending | resolved | suggested | ambiguous | not_found | lookup_unavailable
    layer: str = "not_found"
    inci: str | None = None
    category: str | None = None
    cas: str | None = None
    ec: str | None = None
    source: str | None = None
    source_id: str | None = None
    cands: list[Candidate] = field(default_factory=list)
    high: bool = False
    notes: list[str] = field(default_factory=list)
    merged_from: int | None = None
    split_from: str | None = None
    unexplained_top: int = 0


class Resolver:
    def __init__(self, dictionary: Dictionary | None = None, pubchem: PubChemClient | None = None,
                 thresholds: dict[str, float] | None = None):
        self.d = dictionary or Dictionary()
        self.pubchem = pubchem or PubChemClient(enabled=False)
        self.T = {**THRESHOLDS, **(thresholds or {})}
        self._fz_cache: dict[tuple[str, int], list] = {}

    # ---- layers 1-3 -------------------------------------------------------------------------------
    def _static(self, text: str, optional_tags: list[str]) -> dict | None:
        """inci_exact -> inci_alias -> category_recognized. Returns a dict of fields or None."""
        base = strip_decorations(text)
        for variant in (base, without_parens(base)):
            k = key(variant)
            if not k:
                continue
            e = self.d.exact(k)
            if e:
                return dict(layer="inci_exact", inci=e.inci_name, category=e.category, cas=e.cas, ec=e.ec, source=self.d.source)
            e = self.d.alias(k)
            if e:
                return dict(layer="inci_alias", inci=e.inci_name, category=e.category, cas=e.cas, ec=e.ec, source=self.d.source,
                            notes=[f"Matched through a {e.alias_kind.replace('_', ' ')} alias."])
        if "/" in base:  # slash synonyms: "Aqua/Water/Eau" when the whole string is not an entry
            for part in base.split("/"):
                e = self.d.exact(key(part)) or self.d.alias(key(part))
                if e:
                    return dict(layer="inci_alias", inci=e.inci_name, category=e.category, cas=e.cas, ec=e.ec,
                                source=self.d.source, notes=["Matched through a slash synonym."])
        cat = categories.classify(base) or categories.classify(without_parens(base))
        if cat:
            return dict(layer="category_recognized", category=cat, notes=[categories.NOTE])
        return None

    # ---- fuzzy ------------------------------------------------------------------------------------
    def _fuzzy(self, text: str, limit: int = 3) -> list[tuple[Candidate, int]]:
        k = key(strip_decorations(without_parens(text) or text))
        ck_ = (k, limit)
        if ck_ in self._fz_cache:
            return self._fz_cache[ck_]
        res = self._fuzzy_uncached(k, limit)
        self._fz_cache[ck_] = res
        return res

    def _fuzzy_uncached(self, k: str, limit: int) -> list[tuple[Candidate, int]]:
        if len(k) < 3:
            return []
        pool = process.extract(k, self.d.corpus_keys, scorer=fuzz.ratio, limit=60, score_cutoff=35)
        by_inci: dict[str, tuple[float, list[str], int]] = {}
        for ck, _s, _i in pool:
            sc, edits, un = score_candidate(k, ck)
            name = self.d.corpus[ck]
            if name not in by_inci or sc > by_inci[name][0]:
                by_inci[name] = (sc, edits, un)
        ranked = sorted(by_inci.items(), key=lambda kv: -kv[1][0])[:limit]
        return [(Candidate(inci_name=n, score=round(sc, 3), edits=edits, source="dictionary"), un)
                for n, (sc, edits, un) in ranked if sc >= self.T["suggest_floor"]]

    def _apply_fuzzy(self, st: State, cands: list[tuple[Candidate, int]]):
        st.cands = [c for c, _ in cands]
        if not cands:
            return False
        top, un = cands[0]
        second = cands[1][0].score if len(cands) > 1 else 0.0
        st.status, st.layer, st.unexplained_top = "suggested", "fuzzy", un
        margin = top.score - second
        st.high = ((top.score >= self.T["high_score"] and margin >= self.T["high_margin"] and un <= self.T["max_unexplained"])
                   or (top.score >= self.T["dominant_score"] and margin >= self.T["dominant_margin"]))
        for e in top.edits:
            if "not visible" in e:
                st.notes.append(f"{e}.")
        return True

    # ---- main -------------------------------------------------------------------------------------
    def resolve(self, req: ResolveRequest) -> ResolveResponse:
        t0 = time.perf_counter()
        segs = segment([(t.index, t.raw, t.ocrWordConfidence) for t in req.tokens])
        removed: list[RemovedFragment] = []
        states: list[State] = []
        t_norm = time.perf_counter()

        for s in segs:
            st = State(seg=s, fragments=[s.raw])
            hit = self._static(s.raw, s.tags)
            if hit is None:
                f = nf.strong(s.raw)
                if f:
                    removed.append(RemovedFragment(position=s.position, sourceIndex=s.source_index, raw=s.raw, reason=f[0], kind=f[1]))
                    continue
            if hit:
                st.status, st.layer = "resolved", hit["layer"]
                st.inci, st.category, st.cas, st.ec, st.source = (hit.get(x) for x in ("inci", "category", "cas", "ec", "source"))
                st.notes += hit.get("notes", [])
                st.high = True
            states.append(st)
        t_static = time.perf_counter()

        # fuzzy for everything still open (also feeds merge/split decisions)
        fz: dict[int, list[tuple[Candidate, int]]] = {}
        for i, st in enumerate(states):
            if st.status == "pending":
                fz[i] = self._fuzzy(st.seg.raw)
        t_fuzzy = time.perf_counter()

        states = self._merge(states, fz)
        states = self._split(states, fz)
        # recompute fuzzy for new/changed states
        for st in states:
            if st.status == "pending":
                hit = self._static(" ".join(st.fragments) if st.merged_from else st.seg.raw, st.seg.tags)
                if hit:
                    st.status, st.layer = "resolved", hit["layer"]
                    st.inci, st.category, st.cas, st.ec, st.source = (hit.get(x) for x in ("inci", "category", "cas", "ec", "source"))
                    st.notes += hit.get("notes", []); st.high = True
        t_merge = time.perf_counter()

        # ladder step 4 (PubChem) then 5 (fuzzy) for the rest
        unavailable_seen = False
        for st in states:
            if st.status != "pending":
                continue
            text = " ".join(st.fragments) if st.merged_from else st.seg.raw
            pc_unavail = False
            if self.pubchem.enabled and "?" not in text and len(key(text)) >= 4:
                r = self.pubchem.lookup(without_parens(strip_decorations(text)) or text)
                if r.status == "match":
                    st.status, st.layer, st.source, st.high = "resolved", "pubchem_match", "pubchem", True
                    st.inci, st.source_id = text.upper(), f"CID {r.cid}"
                    st.notes.append("PubChem record match: identity only, not a safety statement.")
                    continue
                if r.status == "ambiguous":
                    st.status, st.layer = "ambiguous", "pubchem_match"
                    st.cands = [Candidate(inci_name=n.upper(), score=0.0, source="pubchem", note="PubChem autocomplete suggestion") for n in (r.names or [])]
                    continue
                pc_unavail = r.status == "unavailable"
            cands = self._fuzzy(text)
            if self._apply_fuzzy(st, cands):
                continue
            if pc_unavail:
                st.status, st.layer = "lookup_unavailable", "lookup_unavailable"; unavailable_seen = True
            else:
                st.status, st.layer = "not_found", "not_found"
        t_end = time.perf_counter()

        items = []
        for n, st in enumerate(states):
            raw = " ".join(st.fragments)
            items.append(ResolvedItem(
                index=n, sourceIndex=st.seg.source_index, raw=raw, fragments=st.fragments if st.merged_from else [],
                mergedFrom=st.merged_from, splitFrom=st.split_from, ocrWordConfidence=st.seg.ocr_conf,
                optional=st.seg.optional, tags=st.seg.tags, status=st.status, layer=st.layer, inci_name=st.inci,
                category=st.category, cas=st.cas, ec=st.ec, source=st.source, source_id=st.source_id,
                candidates=st.cands, highConfidence=st.high, notes=st.notes))
        m = self.d.meta
        meta = Meta(dictionaryVersion=m.get("dictionaryVersion", "unknown"), dictionarySourceDate=m.get("dictionarySourceDate") or None,
                    dictionarySource=self.d.source, agentStatus="off" if not req.useAgent else "not_implemented",
                    pubchemStatus=self.pubchem.state,
                    timings={"normalize_ms": round((t_norm - t0) * 1000, 2), "static_ms": round((t_static - t_norm) * 1000, 2),
                             "fuzzy_ms": round((t_fuzzy - t_static) * 1000, 2), "merge_split_ms": round((t_merge - t_fuzzy) * 1000, 2),
                             "pubchem_fuzzy_ms": round((t_end - t_merge) * 1000, 2), "total_ms": round((t_end - t0) * 1000, 2)},
                    thresholds=self.T)
        return ResolveResponse(items=items, removed=removed, meta=meta)

    # ---- B2 merge ---------------------------------------------------------------------------------
    def _merge(self, states: list[State], fz) -> list[State]:
        out: list[State] = []
        i = 0
        while i < len(states):
            a = states[i]
            if i + 1 < len(states) and a.status == "pending" and states[i + 1].status == "pending" \
                    and a.seg.source_index == states[i + 1].seg.source_index:
                b = states[i + 1]
                joined = f"{a.seg.raw} {b.seg.raw}"
                cands = self._fuzzy(joined)
                static = self._static(joined, [])
                sa = fz.get(i, [(Candidate(inci_name="", score=0), 0)])
                sb = fz.get(i + 1, [(Candidate(inci_name="", score=0), 0)])
                best_frag = max((sa[0][0].score if sa else 0), (sb[0][0].score if sb else 0))
                merged_score = 1.0 if static else (cands[0][0].score if cands else 0.0)
                if merged_score >= self.T["merge_score"] and merged_score - best_frag >= self.T["merge_gain"]:
                    m = State(seg=a.seg, fragments=[a.seg.raw, b.seg.raw], merged_from=2)
                    m.notes.append("Merged from 2 fragments; you can split it again.")
                    out.append(m); i += 2
                    continue
            out.append(a); i += 1
        return out

    # ---- lost comma split -----------------------------------------------------------------------
    def _split(self, states: list[State], fz) -> list[State]:
        out: list[State] = []
        for st in states:
            words = st.seg.raw.split()
            if st.status != "pending" or st.merged_from or len(words) < 2:
                out.append(st); continue
            whole = self._fuzzy(st.seg.raw)
            whole_s = whole[0][0].score if whole else 0.0
            best = None
            for k in range(1, len(words)):
                l, r = " ".join(words[:k]), " ".join(words[k:])
                ls = 1.0 if self._static(l, []) else (self._fuzzy(l)[:1] or [(Candidate(inci_name="", score=0), 0)])[0][0].score
                rs = 1.0 if self._static(r, []) else (self._fuzzy(r)[:1] or [(Candidate(inci_name="", score=0), 0)])[0][0].score
                if min(ls, rs) >= self.T["split_min"] and (ls + rs) / 2 - whole_s >= self.T["split_gain"]:
                    if best is None or ls + rs > best[0]:
                        best = (ls + rs, l, r)
            if best:
                _, l, r = best
                for part in (l, r):
                    seg = Segment(part, st.seg.source_index, st.seg.position, st.seg.optional, list(st.seg.tags), st.seg.ocr_conf)
                    ns = State(seg=seg, fragments=[part], split_from=st.seg.raw)
                    ns.notes.append("Split from one token (a comma may have been lost); check the boundary.")
                    out.append(ns)
            else:
                out.append(st)
        return out
