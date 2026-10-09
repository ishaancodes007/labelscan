"""OCR-confusion-weighted edit distance.

Costs are a *heuristic* design choice (documented here, calibrated on fixtures in scripts/resolution_report.py):
  - match: 0
  - '?' in the OCR text (unreadable glyph) vs any char: 0.1
  - substitution between visually confusable glyphs (CONFUSABLE pairs): 0.4
  - 2-char <-> 1-char confusions (rn/m, cl/d, vv/w): 0.4
  - insertion/deletion of a narrow glyph (I L 1 J T F R): 0.6, else 1.0
  - any other substitution/insertion/deletion: 1.0 (counted as an "unexplained" edit)
  - a candidate's trailing generic word (OIL, EXTRACT, ...) not visible in the token: 0.3 total
"""
from __future__ import annotations

CONFUSABLE_PAIRS = [
    "IL", "I1", "L1", "IJ", "IT", "O0", "OQ", "OD", "OC", "CE", "CG", "CQ", "CD", "EF", "NU", "NM", "NH",
    "UV", "VY", "VN", "B8", "S5", "Z2", "G6", "FP", "PR", "AO", "AE", "MW", "BH", "RK", "TY",
]
CONFUSABLE = {frozenset(p) for p in CONFUSABLE_PAIRS}
MULTI = [("RN", "M"), ("CL", "D"), ("VV", "W")]
NARROW = set("IL1JTFR")
GENERIC_SUFFIXES = ("OIL", "EXTRACT", "WATER", "BUTTER", "WAX", "JUICE", "POWDER", "ACID")  # words an OCR may drop at line end
SUFFIX_COST = 0.3
CONF_SUB, WILD, NARROW_INDEL, FULL = 0.4, 0.1, 0.6, 1.0


def _sub_cost(a: str, b: str) -> tuple[float, str | None]:
    if a == b:
        return 0.0, None
    if a == "?" or b == "?":
        return WILD, f"{a}→{b} (unreadable glyph)"
    if frozenset((a, b)) in CONFUSABLE:
        return CONF_SUB, f"{a}→{b} (look-alike glyphs)"
    return FULL, f"{a}→{b}"


def _indel_cost(c: str) -> float:
    return NARROW_INDEL if c in NARROW else FULL


def distance(tok: str, cand: str) -> tuple[float, list[str], int]:
    """Weighted distance turning `cand` (dictionary key) into `tok` (OCR key).
    Returns (cost, human-readable edits, number of unexplained edits)."""
    n, m = len(tok), len(cand)
    INF = 1e9
    d = [[INF] * (m + 1) for _ in range(n + 1)]
    bp: list[list[tuple | None]] = [[None] * (m + 1) for _ in range(n + 1)]
    d[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            cur = d[i][j]
            if cur >= INF:
                continue
            if i < n and j < m:
                c, e = _sub_cost(tok[i], cand[j])
                if cur + c < d[i + 1][j + 1]:
                    d[i + 1][j + 1] = cur + c; bp[i + 1][j + 1] = (i, j, e, c)
            if i < n:  # token has an extra char (candidate lacks it)
                c = _indel_cost(tok[i])
                if cur + c < d[i + 1][j]:
                    d[i + 1][j] = cur + c; bp[i + 1][j] = (i, j, f"extra '{tok[i]}'", c)
            if j < m:  # candidate char missing from token
                c = _indel_cost(cand[j])
                if cur + c < d[i][j + 1]:
                    d[i][j + 1] = cur + c; bp[i][j + 1] = (i, j, f"'{cand[j]}' missing", c)
            for a, b in MULTI:  # token 2 chars ~ candidate 1 char, and vice versa
                if i + 2 <= n and j < m and tok[i:i + 2] == a and cand[j] == b:
                    if cur + CONF_SUB < d[i + 2][j + 1]:
                        d[i + 2][j + 1] = cur + CONF_SUB; bp[i + 2][j + 1] = (i, j, f"{a}→{b} (look-alike glyphs)", CONF_SUB)
                if i < n and j + 2 <= m and tok[i] == b and cand[j:j + 2] == a:
                    if cur + CONF_SUB < d[i + 1][j + 2]:
                        d[i + 1][j + 2] = cur + CONF_SUB; bp[i + 1][j + 2] = (i, j, f"{b}→{a} (look-alike glyphs)", CONF_SUB)
    edits: list[str] = []
    unexplained = 0
    i, j = n, m
    while (i, j) != (0, 0):
        step = bp[i][j]
        if step is None:
            break
        pi, pj, e, c = step
        if e is not None:
            edits.append(e)
            if c >= FULL:
                unexplained += 1
        i, j = pi, pj
    edits.reverse()
    return d[n][m], edits, unexplained


def score_candidate(tok: str, cand: str) -> tuple[float, list[str], int]:
    """Similarity in [0,1] of OCR key `tok` to dictionary key `cand`, also trying the candidate
    without a trailing generic word ("'Oil' not visible")."""
    best_cost, best_edits, best_un = distance(tok, cand)
    best_len = max(len(tok), len(cand), 1)
    for suf in GENERIC_SUFFIXES:
        if cand.endswith(suf) and len(cand) > len(suf) + 3 and not tok.endswith(suf):
            c, e, u = distance(tok, cand[: -len(suf)])
            c += SUFFIX_COST
            if c < best_cost:
                best_cost, best_edits, best_un = c, e + [f"'{suf.title()}' not visible"], u
                best_len = max(len(tok), len(cand) - len(suf), 1)
    return max(0.0, 1.0 - best_cost / best_len), best_edits, best_un


def cost_only(tok: str, cand: str, bound: float) -> float:
    """Same weighted distance as `distance`, cost only, pull-style with early exit: returns INF as soon as every cell of two
    consecutive rows exceeds `bound` (the score floor makes anything above it irrelevant). ~10x faster than the traceback version."""
    INF = 1e9
    n, m = len(tok), len(cand)
    prev2 = None
    prev = [j * 1.0 for j in range(m + 1)]
    prev[0] = 0.0
    for j in range(1, m + 1):
        prev[j] = prev[j - 1] + _indel_cost(cand[j - 1])
    for i in range(1, n + 1):
        ti = tok[i - 1]
        cur = [INF] * (m + 1)
        cur[0] = prev[0] + _indel_cost(ti)
        row_min = cur[0]
        for j in range(1, m + 1):
            cj = cand[j - 1]
            v = prev[j - 1] + (0.0 if ti == cj else _sub_cost(ti, cj)[0])
            a = prev[j] + _indel_cost(ti)
            if a < v: v = a
            b = cur[j - 1] + _indel_cost(cj)
            if b < v: v = b
            if i >= 2 and prev2 is not None:      # token pair -> one candidate char (rn->m, cl->d, vv->w)
                pair = tok[i - 2:i]
                for x, y in MULTI:
                    if pair == x and cj == y and prev2[j - 1] + CONF_SUB < v: v = prev2[j - 1] + CONF_SUB
            if j >= 2:                             # one token char -> candidate pair
                cp = cand[j - 2:j]
                for x, y in MULTI:
                    if cp == x and ti == y and prev[j - 2] + CONF_SUB < v: v = prev[j - 2] + CONF_SUB
            cur[j] = v
            if v < row_min: row_min = v
        if row_min > bound and (prev2 is None or min(prev) > bound):
            return INF
        prev2, prev = prev, cur
    return prev[m]


def quick_score(tok: str, cand: str, floor: float) -> float:
    """Similarity like `score_candidate` (incl. the dropped-generic-suffix variant) but cost-only and pruned; 0 if below `floor`."""
    maxlen = max(len(tok), len(cand), 1)
    best = 0.0
    c = cost_only(tok, cand, (1.0 - floor) * maxlen)
    if c < 1e8:
        best = max(0.0, 1.0 - c / maxlen)
    for suf in GENERIC_SUFFIXES:
        if cand.endswith(suf) and len(cand) > len(suf) + 3 and not tok.endswith(suf):
            short = cand[: -len(suf)]
            ml = max(len(tok), len(short), 1)
            c = cost_only(tok, short, (1.0 - floor) * ml - SUFFIX_COST)
            if c < 1e8:
                best = max(best, max(0.0, 1.0 - (c + SUFFIX_COST) / ml))
    return best
