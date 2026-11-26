"""FastAPI routes: auth, projects, pipeline actions, one SSE stream per project; serves the built frontend."""

import asyncio
import csv
import json
from collections.abc import AsyncIterable
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Cookie, Depends, FastAPI, HTTPException, Path, Request, Response
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.staticfiles import StaticFiles
from pydantic import AfterValidator, BaseModel, Field

import agents
import config
import db
import llm
import pipeline as pl
import rules


def max_words(n: int):
    def check(v: str) -> str:
        if len(v.split()) > n:
            raise ValueError(f"at most {n} words")
        return v

    return AfterValidator(check)


Area = Literal["Energy", "AI governance", "DC & cloud", "ESG"]
Model = Annotated[str, Field(max_length=80)]


class Cred(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=200)
    password: str = Field(min_length=8, max_length=200)
    name: str = Field("", max_length=80)


class NewProject(BaseModel):
    name: str = Field(min_length=1, max_length=config.NAME_CHARS)
    role: str = Field(max_length=60)
    area: Area


class Run(BaseModel):
    model: Model = config.DEFAULT_MODEL
    brief: Annotated[str, max_words(config.BRIEF_WORDS)] | None = None


class Answer(BaseModel):
    qid: str
    option: int = Field(ge=0, le=3)
    note: Annotated[str, max_words(config.ANSWER_WORDS)] = ""


class ReqAction(BaseModel):
    action: Literal["accept", "reject", "edit"]
    statement: Annotated[str, max_words(config.EDIT_WORDS)] = ""


class Regen(BaseModel):
    feedback: Annotated[str, max_words(config.FEEDBACK_WORDS)]
    model: Model = config.DEFAULT_MODEL


class Resolve(BaseModel):
    resolution: Literal["edit", "fix", "risk"]
    note: str = Field("", max_length=600)


class Levels(BaseModel):
    levels: dict[str, Literal["Low", "Medium", "High"]]
    model: Model = config.DEFAULT_MODEL


class Approve(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: Literal["Project manager", "Architect", "Security lead", "Compliance officer"]
    comment: str = Field("", max_length=600)
    model: Model = config.DEFAULT_MODEL


@asynccontextmanager
async def lifespan(_):
    db.init()
    yield


app = FastAPI(title="Joules", lifespan=lifespan)


def user(joules: str | None = Cookie(None)) -> dict:
    if not (u := db.session_user(joules)):
        raise HTTPException(401, "Sign in first.")
    return u


User = Annotated[dict, Depends(user)]


def owned(pid: int, u: dict) -> dict:
    """Owner check on every project route; someone else's project looks like a missing one."""
    if not (p := db.one("SELECT * FROM projects WHERE id=? AND owner_id=?", pid, u["id"])):
        raise HTTPException(404, "Project not found.")
    return p


def signed_in(resp: Response, user_id: int) -> dict:
    resp.set_cookie(
        "joules", db.new_session(user_id), httponly=True, samesite="lax", max_age=config.SESSION_DAYS * 86400
    )
    return {"ok": True}


@app.post("/api/auth/register")
def register(c: Cred, resp: Response):
    if db.one("SELECT id FROM users WHERE email=?", c.email.lower()):
        raise HTTPException(409, "That email already has an account.")
    return signed_in(resp, db.add_user(c.email, c.name or c.email.split("@")[0], c.password))


@app.post("/api/auth/login")
def login(c: Cred, req: Request, resp: Response):
    if not llm.allow(f"login:{req.client.host if req.client else '?'}", config.LOGIN_PER_MIN, 60):
        raise HTTPException(429, "Too many sign-in attempts. Wait a minute.")
    if not (u := db.check_login(c.email, c.password)):
        raise HTTPException(401, "Email or password is wrong.")
    return signed_in(resp, u["id"])


@app.post("/api/auth/logout")
def logout(resp: Response, joules: str | None = Cookie(None)):
    db.run("DELETE FROM sessions WHERE token=?", joules)
    resp.delete_cookie("joules")
    return {"ok": True}


@app.get("/api/me")
def me(u: User):
    return u


@app.get("/api/projects")
def list_projects(u: User):
    return db.q(
        "SELECT id, name, role, area, stage, created_at, updated_at FROM projects WHERE owner_id=? "
        "ORDER BY updated_at DESC",
        u["id"],
    )


@app.post("/api/projects")
def create_project(b: NewProject, u: User):
    pid = db.run(
        "INSERT INTO projects(owner_id, name, role, area, created_at, updated_at) VALUES (?,?,?,?,?,?)",
        u["id"],
        b.name,
        b.role,
        b.area,
        db.now(),
        db.now(),
    )
    return state(pid, u)


@app.get("/api/projects/{pid}")
def state(pid: int, u: User):
    """Everything the workspace and the report need, so a reload resumes where it stopped."""
    p = owned(pid, u)
    audit = db.q(
        "SELECT id, at, kind, agent, model, substr(prompt, 1, 4000) AS prompt, substr(response, 1, 4000) "
        "AS response, evidence_ids, rules, tokens_in, tokens_out, ms FROM audit WHERE project_id=? ORDER BY id",
        pid,
    )
    running = (t := pl.TASKS.get(pid)) is not None and not t.done()
    return p | {
        "requirements": pl.requirements(pid),
        "running": running,
        "audit": audit,
        "conflicts": db.q("SELECT * FROM conflicts WHERE project_id=? ORDER BY id", pid),
        "approvals": db.q("SELECT * FROM approvals WHERE project_id=? ORDER BY id", pid),
        "gates": {1: pl.gate_ok(p, 1), 2: pl.gate_ok(p, 2)},
    }


@app.delete("/api/projects/{pid}")
def delete_project(pid: int, u: User):
    owned(pid, u)
    db.run("DELETE FROM projects WHERE id=?", pid)  # cascades to requirements, conflicts, approvals, audit
    return {"ok": True}


@app.post("/api/projects/{pid}/reset")
def reset_project(pid: int, u: User):
    """Back to stage 0 so the demo can run again: keeps name, role, area, brief and uploads; clears the rest."""
    p = owned(pid, u)
    if (t := pl.TASKS.get(pid)) and not t.done():
        raise HTTPException(409, "A step is still running.")
    for table in ("requirements", "conflicts", "approvals", "audit"):
        db.run(f"DELETE FROM {table} WHERE project_id=?", pid)
    keep = {"masked": p["artefacts"].get("masked", 0)}  # PII count of the brief, shown on the Brief stage
    db.update("projects", pid, answers={}, factors={}, ranking=[], workflow={}, artefacts=keep)
    db.update("projects", pid, stage=0, baseline_version=0, updated_at=db.now())
    return state(pid, u)


@app.post("/api/projects/{pid}/upload")
async def upload(pid: int, name: str, req: Request, u: User):
    """Raw file body (PDF, TXT, MD); parsed, capped, masked, stored. Raw bytes are never kept."""
    p = owned(pid, u)
    body = await req.body()
    if len(p["uploads"]) >= config.MAX_UPLOADS or len(body) > config.UPLOAD_BYTES:
        raise HTTPException(413, f"Up to {config.MAX_UPLOADS} files of 5 MB each.")
    try:
        text = pl.read_upload(name, body)
    except ValueError as e:
        raise HTTPException(415, str(e)) from e
    words = text.split()
    masked, n = rules.mask(" ".join(words[: config.UPLOAD_WORDS]))
    item = {
        "name": name[:120],
        "words": min(len(words), config.UPLOAD_WORDS),
        "cut": len(words) > config.UPLOAD_WORDS,
        "masked": n,
        "text": masked,
    }
    db.update("projects", pid, uploads=[*p["uploads"], item], updated_at=db.now())
    return item | {"text": masked[:300]}


@app.post("/api/projects/{pid}/run")
async def run(pid: int, b: Run, u: User):
    """Start or retry the current automatic step."""
    p = owned(pid, u)
    if p["stage"] == 0 and b.brief is not None:
        masked, n = rules.mask(b.brief)
        db.update("projects", pid, brief_masked=masked, artefacts=p["artefacts"] | {"masked": n}, updated_at=db.now())
        p = owned(pid, u)
    if p["stage"] == 0 and not p["brief_masked"].strip():
        raise HTTPException(422, "Write a brief first.")
    if not (step := pl.next_step(p)):
        raise HTTPException(409, "Nothing to run: answer the open questions or approve the gate first.")
    if not llm.allow(f"run:{u['id']}", config.RUNS_PER_HOUR, 3600):
        raise HTTPException(429, f"Run limit reached ({config.RUNS_PER_HOUR} per hour).")
    if not pl.start(pid, step, b.model):
        raise HTTPException(409, "A step is already running.")
    return {"started": step.__name__}


@app.get("/api/projects/{pid}/events", response_class=EventSourceResponse)
async def events(pid: int, u: User) -> AsyncIterable[ServerSentEvent]:
    """Typed events while the page is open; on reconnect the client reloads full state first."""
    owned(pid, u)
    q: asyncio.Queue = asyncio.Queue()
    pl.LISTENERS[pid].add(q)
    try:
        yield ServerSentEvent(data={"stage": pl.project(pid)["stage"]}, event="stage")
        while True:
            try:
                event, data = await asyncio.wait_for(q.get(), 15)
                yield ServerSentEvent(data=data, event=event)
            except TimeoutError:
                yield ServerSentEvent(comment="keep-alive")
    finally:
        pl.LISTENERS[pid].discard(q)


@app.post("/api/projects/{pid}/answers")
def answer(pid: int, b: Answer, u: User):
    p = owned(pid, u)
    ans = p["answers"]
    q = next((q for q in ans.get("questions", []) if q["id"] == b.qid), None)
    if not q or b.option >= len(q["options"]):
        raise HTTPException(422, "Unknown question or option.")
    note, n = rules.mask(b.note)
    ans["given"][b.qid] = {"option": b.option, "answer": q["options"][b.option], "note": note, "masked": n}
    db.update("projects", pid, answers=ans, updated_at=db.now())
    pl.act(pid, "answer", {"qid": b.qid, "option": b.option})
    return ans


def _req(pid: int, rid: str) -> dict:
    if not (row := db.one("SELECT * FROM requirements WHERE project_id=? AND rid=?", pid, rid)):
        raise HTTPException(404, "Requirement not found.")
    return row


@app.patch("/api/projects/{pid}/requirements/{rid}")
def change_requirement(pid: int, rid: str, b: ReqAction, u: User):
    p, row = owned(pid, u), _req(pid, rid)
    data = dict(row["data"])  # copy: save_requirement compares old and new text
    if b.action == "edit":
        if not b.statement.strip():
            raise HTTPException(422, "Write the new statement.")
        data["statement"], _ = rules.mask(b.statement)
    pl.act(pid, f"requirement_{b.action}", {"rid": rid})
    return pl.save_requirement(p, row, data, {"accept": "accepted", "reject": "rejected", "edit": "edited"}[b.action])


@app.post("/api/projects/{pid}/requirements/{rid}/regenerate")
async def regenerate(pid: int, rid: str, b: Regen, u: User):
    p, row = owned(pid, u), _req(pid, rid)
    feedback, _ = rules.mask(b.feedback)
    leaves = list(p["artefacts"].get("evidence", {}).values())
    labels = {e["label"]: e["id"] for e in leaves}
    new = await agents.regenerate(p, row["data"], feedback, leaves, b.model)
    new["evidence"] = [labels.get(x, x) for x in new["evidence"]]
    pl.act(pid, "requirement_regenerate", {"rid": rid, "feedback": feedback})
    return pl.save_requirement(p, row, new | {"id": rid, "stakeholder": p["role"]}, "open")


@app.post("/api/projects/{pid}/conflicts/{cid}")
def resolve(pid: int, cid: int, b: Resolve, u: User):
    owned(pid, u)
    if b.resolution == "risk" and not b.note.strip():
        raise HTTPException(422, "Accepting a risk needs a note.")
    if not db.one("SELECT id FROM conflicts WHERE id=? AND project_id=?", cid, pid):
        raise HTTPException(404, "Conflict not found.")
    db.update("conflicts", cid, resolution=b.resolution, note=b.note)
    pl.act(pid, "conflict_resolve", {"id": cid, "resolution": b.resolution})
    return {"stage": pl.refresh(pid)}


@app.put("/api/projects/{pid}/factors")
async def set_factors(pid: int, b: Levels, u: User):
    """Change ratings; the ranking is recomputed by code at once, the workflow is rewritten if the top model changed."""
    p = owned(pid, u)
    if not p["factors"]:
        raise HTTPException(409, "The Planner has not rated factors yet.")
    factors = {k: v | {"level": b.levels.get(k, v["level"])} for k, v in p["factors"].items()}
    ranking = rules.rank({k: v["level"] for k, v in factors.items()})
    db.update("projects", pid, factors=factors, ranking=ranking, updated_at=db.now())
    pl.act(pid, "factors", b.levels)
    if ranking[0]["model"] != p["workflow"].get("model"):
        pl.start(pid, pl.workflow_step, b.model)
    return {"ranking": ranking, "factors": factors}


@app.post("/api/projects/{pid}/gates/{gate}")
async def approve(pid: int, gate: Annotated[int, Path(ge=1, le=2)], b: Approve, u: User):
    p = owned(pid, u)
    if gate == 1 and p["stage"] < 4:
        raise HTTPException(409, "Resolve every conflict before gate 1.")
    if gate == 2 and not (pl.gate_ok(p, 1) and p["ranking"]):
        raise HTTPException(409, "Gate 2 needs gate 1 and a ranking.")
    db.run(
        "INSERT INTO approvals(project_id, gate, version, name, role, comment, at) VALUES (?,?,?,?,?,?,?)",
        pid,
        gate,
        p["baseline_version"],
        b.name,
        b.role,
        b.comment,
        db.now(),
    )
    pl.act(pid, f"gate_{gate}", {"name": b.name, "role": b.role, "version": p["baseline_version"]})
    if gate == 1:
        pl.start(pid, pl.plan_step, b.model)
    return {"stage": pl.refresh(pid)}


@app.get("/api/models")
async def models():
    return await llm.model_status()


@app.get("/api/sources")
def sources():
    """Manifest rows for the Terms page and the report's licence line."""
    with config.MANIFEST.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


@app.get("/api/eval")
def evaluation():
    f = config.DATA / "eval.json"
    return json.loads(f.read_text()) if f.exists() else {}


@app.get("/api/health")
def health():
    return {"ok": True}


if (dist := config.ROOT / "frontend" / "dist").exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
