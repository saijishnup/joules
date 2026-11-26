"""429 handling: the limited model gets a retry countdown and the chain skips it until the window ends."""

import asyncio
import time

import httpx
import openai
from pydantic import BaseModel

import config
import llm


class Out(BaseModel):
    ok: bool


def test_rate_limit_countdown_and_skip(monkeypatch):
    first, calls = config.CHAIN[0], []
    resp = httpx.Response(429, headers={"retry-after": "42"}, request=httpx.Request("POST", "http://x"))

    async def fake(m, messages):
        calls.append(m)
        if m == first:
            raise openai.RateLimitError("slow down", response=resp, body=None)
        return '{"ok": true}', 1, 1

    monkeypatch.setattr(llm, "_call", fake)
    monkeypatch.setattr(llm, "_audit", lambda *a: None)
    pid = 1
    for _ in range(2):  # second call must not touch the limited model
        asyncio.run(llm.ask("t", "s", "u", Out, model=first, project_id=pid, agent="a"))
    assert calls.count(first) == 1 and calls[1] != first
    row = next(r for r in asyncio.run(llm.model_status()) if r["id"] == first)
    assert row["status"] == "rate-limited" and 40 <= row["retry_in"] <= 42
    llm.RETRY_AT[first] = time.time() - 1  # window over: back to ok
    row = next(r for r in asyncio.run(llm.model_status()) if r["id"] == first)
    assert row["status"] == "ok" and row["retry_in"] == 0
