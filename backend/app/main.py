import os
from fastapi import FastAPI
from .dictionary import Dictionary
from .models import ResolveRequest, ResolveResponse
from .pubchem import PubChemClient
from .resolver import Resolver

app = FastAPI(title="BeautyLens identity resolver", version="0.1.0")
_resolver = Resolver(Dictionary(), PubChemClient(enabled=os.environ.get("PUBCHEM_ENABLED", "1") == "1"))


@app.get("/healthz")
def healthz():
    return {"ok": True, "dictionary": _resolver.d.meta.get("dictionaryVersion"), "pubchem": _resolver.pubchem.state}


@app.post("/v1/ingredients/resolve", response_model=ResolveResponse)
def resolve(req: ResolveRequest) -> ResolveResponse:
    # sync endpoint -> runs in FastAPI's threadpool; logs counts and timings only, never text
    res = _resolver.resolve(req)
    print(f"resolve items={len(res.items)} removed={len(res.removed)} ms={res.meta.timings.get('total_ms')}")
    return res
