"""Pydantic models for POST /v1/ingredients/resolve. TypeScript mirror: lib/resolverTypes.ts."""
from typing import Literal, Optional
from pydantic import BaseModel, Field

Status = Literal["resolved", "suggested", "ambiguous", "not_found", "lookup_unavailable"]
Layer = Literal[
    "inci_exact", "inci_alias", "category_recognized", "pubchem_match",
    "fuzzy", "ai_agent", "not_found", "lookup_unavailable",
]


class TokenIn(BaseModel):
    index: int
    raw: str = Field(max_length=20000)
    ocrWordConfidence: Optional[float] = None


class ResolveRequest(BaseModel):
    tokens: list[TokenIn] = Field(max_length=500)
    useAgent: bool = False
    locale: str = "en"


class Candidate(BaseModel):
    inci_name: str
    score: float
    source: Literal["dictionary", "pubchem", "ai_agent"] = "dictionary"
    source_id: Optional[str] = None
    edits: list[str] = []          # human-readable edits that explain the match
    note: Optional[str] = None


class ResolvedItem(BaseModel):
    index: int                      # output position (order preserved)
    sourceIndex: int                # index of the request token this came from
    raw: str                        # raw text exactly as received (fragments joined with a space if merged)
    fragments: list[str] = []       # >1 when merged from several fragments
    mergedFrom: Optional[int] = None  # number of fragments if merged
    splitFrom: Optional[str] = None   # raw text of the token this was split out of (lost comma)
    ocrWordConfidence: Optional[float] = None
    optional: bool = False          # "may contain" / "+/-" section
    tags: list[str] = []            # e.g. nano
    status: Status
    layer: Layer
    inci_name: Optional[str] = None
    category: Optional[str] = None  # botanical | polymer | fragrance | colorant | ...
    cas: Optional[str] = None
    ec: Optional[str] = None
    source: Optional[str] = None    # dictionary source label: "seed" | "cosing" | "pubchem"
    source_id: Optional[str] = None
    candidates: list[Candidate] = []
    highConfidence: bool = False
    notes: list[str] = []


class RemovedFragment(BaseModel):
    position: int                   # where it appeared among the segments (for restore)
    sourceIndex: int
    raw: str
    reason: str
    kind: str


class Meta(BaseModel):
    dictionaryVersion: str
    dictionarySourceDate: Optional[str] = None
    dictionarySource: str
    agentStatus: Literal["off", "not_implemented", "unavailable", "rate_limited", "on"] = "off"
    pubchemStatus: Literal["on", "off", "unavailable"] = "off"
    agentTokensProcessed: int = 0
    agentTokensSkipped: int = 0
    timings: dict[str, float] = {}
    thresholds: dict[str, float] = {}


class ResolveResponse(BaseModel):
    items: list[ResolvedItem]
    removed: list[RemovedFragment]
    meta: Meta
