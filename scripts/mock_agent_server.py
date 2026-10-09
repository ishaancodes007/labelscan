#!/usr/bin/env python3
"""TEST-ONLY: runs the identity service with a SCRIPTED MOCK model in place of the real AI helper, so the UI path can be exercised
without an API key. The mock calls fuzzy_candidates on the token and submits the first name that tool returned. It is not an AI result.
Usage (repo root, venv active):  python scripts/mock_agent_server.py 8000"""
import json, sys
from pathlib import Path
from types import SimpleNamespace as NS
import uvicorn
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import main  # noqa: E402
from app.agent import ResolutionAgent  # noqa: E402

class MockModel:
    def __init__(self): self.messages, self.n = self, 0
    def create(self, **kw):
        msgs = kw["messages"]; self.n += 1
        token = json.loads(msgs[0]["content"].split("\n", 1)[1])["token"]
        last = msgs[-1]
        if last["role"] == "user" and isinstance(last["content"], list):          # a tool result came back
            tid = last["content"][0]["tool_use_id"]; res = json.loads(last["content"][0]["content"])["results"]
            if not res: return NS(content=[NS(type="tool_use", id="s1", name="submit_resolution", input={"verdict": "no_confident_match"})], stop_reason="tool_use")
            return NS(content=[NS(type="tool_use", id="s1", name="submit_resolution", input={"verdict": "candidate", "candidates": [
                {"inci_name": res[-1]["inci_name"], "source": "dictionary", "evidence_tool_call_ids": [tid], "rationale": "Mock model: last name returned by the lookup."}]})], stop_reason="tool_use")
        return NS(content=[NS(type="tool_use", id=f"t{self.n}", name="search_inci_dictionary", input={"query": token.split()[0][:6]})], stop_reason="tool_use")

main._resolver.agent = ResolutionAgent(main._resolver, client=MockModel(), model="mock-model")
uvicorn.run(main.app, host="127.0.0.1", port=int(sys.argv[1]) if len(sys.argv) > 1 else 8000, log_level="warning")
