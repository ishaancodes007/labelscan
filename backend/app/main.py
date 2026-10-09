import hmac, os
from fastapi import Depends, FastAPI, Header, HTTPException
from .dictionary import Dictionary
from .models import ResolveRequest, ResolveResponse
from .pubchem import PubChemClient
from .resolver import Resolver

app = FastAPI(title="BeautyLens identity resolver", version="0.1.0")
_resolver = Resolver(Dictionary(), PubChemClient(enabled=os.environ.get("PUBCHEM_ENABLED", "1") == "1"))


def require_token(x_service_token: str | None = Header(default=None)) -> None:
    """If SERVICE_TOKEN is set (do this on any public deployment), every /v1 call must carry it. Unset = open, for local development."""
    want = os.environ.get("SERVICE_TOKEN", "")
    if want and not hmac.compare_digest(x_service_token or "", want):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/healthz")
def healthz():
    return {"ok": True, "dictionary": _resolver.d.meta.get("dictionaryVersion"), "pubchem": _resolver.pubchem.state}


@app.post("/v1/ingredients/resolve", response_model=ResolveResponse, dependencies=[Depends(require_token)])
def resolve(req: ResolveRequest) -> ResolveResponse:
    # sync endpoint -> runs in FastAPI's threadpool; logs counts and timings only, never text
    res = _resolver.resolve(req)
    print(f"resolve items={len(res.items)} removed={len(res.removed)} ms={res.meta.timings.get('total_ms')}")
    return res
