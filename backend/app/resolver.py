"""Identity resolver: normalize -> filter -> ladder -> merge/split -> PubChem -> fuzzy. Identity only; no rules, no safety."""
from __future__ import annotations
import re, time
from dataclasses import dataclass, field
from rapidfuzz import fuzz, process

from . import categories, filter as nf
from .dictionary import Dictionary, key
from .models import Candidate, Meta, RemovedFragment, ResolvedItem, ResolveRequest, ResolveResponse
from .normalize import Segment, segment, strip_decorations, without_parens
from .ocr_confusion import quick_score, score_candidate
from .pubchem import PubChemClient

# Calibrated in scripts/resolution_report.py --sweep (see backend/README.md for the numbers and their limits).
THRESHOLDS = {
    "high_score": 0.80,      # top-1 score needed to flag a suggestion high_confidence
    "high_margin": 0.08,     # top-1 minus top-2 score
    "max_unexplained": 1,    # edits not explained by look-alike glyphs / narrow-glyph drops
    "dominant_score": 0.85, "dominant_margin": 0.15,  # very dominant candidate: high-confidence even with unexplained edits
    "suggest_floor": 0.55,   # below this a fuzzy candidate is not shown
    "merge_score": 0.75, "merge_gain": 0.10,
    "split_min": 0.60, "split_gain": 0.10,
    "max_merge_tries": 40, "max_split_tries": 25,   # per request: keeps latency bounded on noisy OCR text
    "split_whole_unexplained": 3, "split_part_unexplained": 2,   # whole token has no OCR-plausible match, each half does -> split
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
        inner = re.search(r"\(([^()]+)\)\s*$", base)       # "Vitamin E (Tocopheryl Acetate)": try the name in parentheses too
        for variant in (base, without_parens(base), inner.group(1) if inner else ""):
            k = key(variant)
            if not k:
                continue
            e = self.d.exact(k)
            if e:
                return dict(layer="inci_exact", inci=e.inci_name, category=e.category, cas=e.cas, ec=e.ec, source=e.source or self.d.source)
            e = self.d.alias(k)
            if e:
                return dict(layer="inci_alias", inci=e.inci_name, category=e.category, cas=e.cas, ec=e.ec, source=e.source or self.d.source,
                            notes=[f"Matched through a {e.alias_kind.replace('_', ' ')} alias."])
        if "/" in base:  # slash synonyms: "Aqua/Water/Eau" when the whole string is not an entry
            for part in base.split("/"):
                e = self.d.exact(key(part)) or self.d.alias(key(part))
                if e:
                    return dict(layer="inci_alias", inci=e.inci_name, category=e.category, cas=e.cas, ec=e.ec,
                                source=e.source or self.d.source, notes=["Matched through a slash synonym."])
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
        if len(k) < 3 or len(k) > 60:
            return []
        floor = self.T["suggest_floor"]
        pool = process.extract(k, self.d.corpus_keys, scorer=fuzz.ratio, limit=40, score_cutoff=45)
        scored: dict[str, tuple[float, str]] = {}
        for ck, _s, _i in pool:
            sc = quick_score(k, ck, floor)
            if sc >= floor:
                name = self.d.corpus[ck]
                if name not in scored or sc > scored[name][0]:
                    scored[name] = (sc, ck)

        def prior(name: str) -> int:
            return self.d.suffix_freq.get(name.split()[-1], 0) if " " in name else 0
        ranked = sorted(scored.items(), key=lambda kv: (-round(kv[1][0] / 0.005), -prior(kv[0]), -kv[1][0]))[:limit]
        out = []
        for name, (_sc, ck) in ranked:   # full traceback (edits, unexplained count) only for the few finalists
            sc, edits, un = score_candidate(k, ck)
            out.append((Candidate(inci_name=name, score=round(sc, 3), edits=edits, source="dictionary"), un))
        out.sort(key=lambda x: (-round(x[0].score / 0.005), -prior(x[0].inci_name), -x[0].score))
        return out

    def _word_swap_note(self, text: str, cand: Candidate) -> str | None:
        """Warn when a candidate differs from the printed text by a WHOLE WORD that is itself a valid ingredient word
        (e.g. printed 'Aluminum Hydroxide', candidate 'Sodium Hydroxide'): that is a different ingredient, not a misspelling."""
        tw = re.findall(r"[A-Z0-9]{3,}", without_parens(text).upper())
        cw = re.findall(r"[A-Z0-9]{3,}", cand.inci_name.upper())
        extra_t = [w for w in tw if w not in cw]
        extra_c = [w for w in cw if w not in tw]
        for w in extra_t:
            if w in self.d.vocab and len(w) >= 4:
                for c in extra_c:
                    if c in self.d.vocab and len(c) >= 4 and fuzz.ratio(w, c) < 90:
                        return f"Printed '{w.title()}' is a different ingredient word from '{c.title()}'. This may be a different ingredient, not a misspelling: check the pack."
        return None

    def _apply_fuzzy(self, st: State, cands: list[tuple[Candidate, int]], text: str = ""):
        if text:
            cands = [(c.model_copy(update={"note": self._word_swap_note(text, c)}) if self._word_swap_note(text, c) else c, un) for c, un in cands]
        st.cands = [c for c, _ in cands]
        if not cands:
            return False
        top, un = cands[0]
        second = cands[1][0].score if len(cands) > 1 else 0.0
        st.status, st.layer, st.unexplained_top = "suggested", "fuzzy", un
        margin = top.score - second
        extra = sum(1 for e in top.edits if e.startswith("extra"))
        st.high = (((top.score >= self.T["high_score"] and margin >= self.T["high_margin"] and un <= self.T["max_unexplained"])
                    or (top.score >= self.T["dominant_score"] and margin >= self.T["dominant_margin"]))
                   and extra < 2)   # never bulk-acceptable when the token has 2+ extra characters: OCR truncates names more often than it invents letters
        if extra >= 2:
            st.notes.append("The text has extra characters, so a word may be cut off or merged with its neighbour: check the pack.")
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
            if hit is None and (len(s.raw.split()) > 9 or len(s.raw) > 90):
                removed.append(RemovedFragment(position=s.position, sourceIndex=s.source_index, raw=s.raw,
                                               reason="long text fragment (too long to be one ingredient name)", kind="long_text"))
                continue
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
            if self._apply_fuzzy(st, cands, text):
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
        tries = 0
        while i < len(states):
            a = states[i]
            if i + 1 < len(states) and a.status == "pending" and states[i + 1].status == "pending" \
                    and a.seg.source_index == states[i + 1].seg.source_index \
                    and tries < self.T["max_merge_tries"] and len(a.seg.raw.split()) <= 3 and len(states[i + 1].seg.raw.split()) <= 3 \
                    and (fz.get(i) or fz.get(i + 1) or states[i].seg.raw):
                tries += 1
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
        tries = 0
        for st in states:
            words = st.seg.raw.split()
            if st.status != "pending" or st.merged_from or len(words) < 2 or len(words) > 5 or tries >= self.T["max_split_tries"]:
                out.append(st); continue
            tries += 1
            whole = self._fuzzy(st.seg.raw)
            whole_s = whole[0][0].score if whole else 0.0
            whole_un = whole[0][1] if whole else 99
            best = None
            for k in range(1, len(words)):
                l, r = " ".join(words[:k]), " ".join(words[k:])
                lf = self._fuzzy(l)[:1] or [(Candidate(inci_name="", score=0), 99)]
                rf = self._fuzzy(r)[:1] or [(Candidate(inci_name="", score=0), 99)]
                ls = 1.0 if self._static(l, []) else lf[0][0].score
                rs = 1.0 if self._static(r, []) else rf[0][0].score
                lu = 0 if ls == 1.0 else lf[0][1]; ru = 0 if rs == 1.0 else rf[0][1]
                explained = whole_un >= self.T["split_whole_unexplained"] and max(lu, ru) <= self.T["split_part_unexplained"]
                if min(ls, rs) >= self.T["split_min"] and ((ls + rs) / 2 - whole_s >= self.T["split_gain"] or explained):
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
