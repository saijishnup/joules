"""One OpenAI-compatible client: JSON mode, Pydantic check + 1 retry, fallback chain, mock fixtures, audit log."""

import json
import time
from collections import defaultdict, deque

import openai
from pydantic import BaseModel, ValidationError

import config
import db

STATUS: dict[str, str] = dict.fromkeys(config.CHAIN, "ok")  # model picker dot: ok / rate-limited / offline
_hits: dict[str, deque] = defaultdict(deque)


def allow(key: str, limit: int, window: float) -> bool:
    """In-memory sliding-window rate limit (NFR-03). Single process only; Redis if it ever scales out."""
    q, now = _hits[key], time.monotonic()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def _client(model: str) -> tuple[openai.AsyncOpenAI, str]:
    if model.startswith("ollama/"):
        return openai.AsyncOpenAI(base_url=config.OLLAMA_URL, api_key="ollama", max_retries=0), model[7:]
    return openai.AsyncOpenAI(base_url=config.GATEWAY_URL, api_key=config.GATEWAY_KEY or "none", max_retries=0), model


def chain_from(model: str) -> list[str]:
    """Picked model first, then the rest of the chain below it; mock is the floor."""
    chain = config.CHAIN
    return chain[chain.index(model) :] if model in chain else [model, *chain]


async def _call(model: str, messages: list[dict]) -> tuple[str, int, int]:
    client, name = _client(model)
    # Reasoning models (gpt-oss) spend output tokens thinking: cap the thinking, raise the output limit.
    extra = {"reasoning_effort": "low"} if "gpt-oss" in name else {}
    r = await client.chat.completions.create(
        model=name,
        messages=messages,
        response_format={"type": "json_object"},
        timeout=config.LLM_TIMEOUT,
        max_tokens=config.LLM_MAX_TOKENS,
        **extra,
    )
    u = r.usage
    return r.choices[0].message.content or "", u.prompt_tokens if u else 0, u.completion_tokens if u else 0


async def ask(
    task: str,
    system: str,
    user: str,
    schema: type[BaseModel],
    *,
    model: str,
    project_id: int,
    agent: str,
    evidence_ids=(),
    chain: list[str] | None = None,
) -> BaseModel:
    """Validated answer from the first model in the chain that works. Every attempt is written to audit.
    `chain` replaces the default fallback list (the eval judge uses its own)."""
    if not allow(f"llm:{project_id}", config.LLM_PER_HOUR, 3600):
        raise RuntimeError("LLM call limit reached (60 per hour). Try again later.")
    for m in chain or chain_from(model):
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        for _ in range(2):  # 1 retry with the validation error
            start, tin, tout = time.monotonic(), 0, 0
            try:
                if m == "mock":
                    text = (config.FIXTURES / f"{task}.json").read_text(encoding="utf-8")
                    tin, tout = len(system + user) // 4, len(text) // 4  # rough count, mock has no tokenizer
                else:
                    text, tin, tout = await _call(m, messages)
                out = schema.model_validate_json(text)
                STATUS[m] = "ok"
                _audit(project_id, agent, m, messages, text, evidence_ids, tin, tout, start)
                return out
            except ValidationError as e:
                _audit(project_id, agent, m, messages, f"invalid: {e}", evidence_ids, tin, tout, start)
                messages = [
                    *messages,
                    {
                        "role": "user",
                        "content": f"Your JSON did not match the schema: {e}. Reply with fixed JSON only.",
                    },
                ]
            except (openai.APIError, OSError) as e:  # 429, timeouts, gateway or Ollama down: fall back
                STATUS[m] = "rate-limited" if isinstance(e, openai.RateLimitError) else "offline"
                _audit(project_id, agent, m, messages, f"error: {e}", evidence_ids, tin, tout, start)
                break
    raise RuntimeError(f"No model in the chain answered for {task}.")


def _audit(pid, agent, model, messages, response, evidence_ids, tin, tout, start) -> None:
    db.run(
        "INSERT INTO audit(project_id, at, kind, agent, model, prompt, response, evidence_ids, tokens_in, "
        "tokens_out, ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        pid,
        db.now(),
        "llm",
        agent,
        model,
        json.dumps(messages),
        response,
        list(evidence_ids),
        tin,
        tout,
        round((time.monotonic() - start) * 1000),
    )
