"""Async stage runner: one task per project, typed SSE events, stage saved in SQLite after every step."""

import asyncio
import logging
from collections import defaultdict

import pymupdf

import agents
import db
import retrieval
import rules

log = logging.getLogger("joules")
STAGES = ["Brief", "Interview", "Requirements", "Conflicts", "Approve", "SDLC", "Export"]
TASKS: dict[int, asyncio.Task] = {}
LISTENERS: dict[int, set[asyncio.Queue]] = defaultdict(set)


def publish(pid: int, event: str, data: dict) -> None:
    """Typed SSE event to every open stream of this project (stage, agent_state, question, requirement, ...)."""
    for q in LISTENERS[pid]:
        q.put_nowait((event, data))


def project(pid: int) -> dict:
    return db.one("SELECT * FROM projects WHERE id=?", pid)


def requirements(pid: int) -> list[dict]:
    rows = db.q("SELECT * FROM requirements WHERE project_id=? ORDER BY id", pid)
    return [r["data"] | {"status": r["status"], "version": r["version"]} for r in rows]


def gate_ok(p: dict, gate: int) -> bool:
    """A gate counts only for the current baseline; editing an approved requirement opens a new baseline."""
    return bool(
        db.one(
            "SELECT id FROM approvals WHERE project_id=? AND gate=? AND version=?", p["id"], gate, p["baseline_version"]
        )
    )


def refresh(pid: int) -> int:
    """Derive the furthest open stage from saved data, store it, and tell the client if it moved."""
    p = project(pid)
    has_reqs = bool(db.one("SELECT id FROM requirements WHERE project_id=?", pid))
    open_conf = db.one("SELECT id FROM conflicts WHERE project_id=? AND resolution IS NULL", pid)
    if gate_ok(p, 1) and gate_ok(p, 2):
        stage = 6
    elif gate_ok(p, 1) and p["ranking"]:
        stage = 5
    elif has_reqs:
        stage = 3 if open_conf else 4
    else:
        stage = 1 if p["answers"].get("questions") else 0
    if stage != p["stage"]:
        db.update("projects", pid, stage=stage, updated_at=db.now())
        publish(pid, "stage", {"stage": stage})
    return stage


def start(pid: int, step, model: str) -> bool:
    """Run one step as a background task; refuses while the project already has one running."""
    if (t := TASKS.get(pid)) and not t.done():
        return False
    TASKS[pid] = asyncio.create_task(_guard(pid, step, model))
    return True


async def _guard(pid: int, step, model: str) -> None:
    try:
        await step(pid, model)
    except Exception as e:  # the stage stays where it was, so "run" retries it (NFR-04)
        log.exception("step failed")
        db.run("INSERT INTO audit(project_id, at, kind, response) VALUES (?,?,?,?)", pid, db.now(), "error", str(e))
        publish(pid, "error", {"message": str(e)})
    finally:
        publish(pid, "agent_state", {"agent": None, "state": "idle"})


def next_step(p: dict):
    """Which step the Run button means for the saved state, or None when a person must act first."""
    ans = p["answers"]
    if p["stage"] == 0:
        return interview_step
    if p["stage"] == 1:
        if any(q["id"] not in ans.get("given", {}) for q in ans["questions"]):
            return None
        return interview_step if ans.get("round") == 1 else analyse_step
    if gate_ok(p, 1) and not p["ranking"]:
        return plan_step
    return None


async def labelled(queries: list[str], model: str, pid: int) -> list[dict]:
    """Search each query, drop repeats, label leaves E1..En for the prompt."""
    leaves, seen = [], set()
    for q in queries:
        for leaf in await retrieval.search(q, model=model, project_id=pid):
            if leaf["id"] not in seen:
                seen.add(leaf["id"])
                leaves.append(leaf | {"label": f"E{len(leaves) + 1}"})
    return leaves


async def interview_step(pid: int, model: str) -> None:
    p = project(pid)
    ans = p["answers"]
    rnd = ans.get("round", 0) + 1
    publish(pid, "agent_state", {"agent": "Interviewer", "state": "thinking"})
    given = ans.get("given", {})
    gaps = [
        f"{q['id']} '{q['text']}' was answered Not sure."
        for q in ans.get("questions", [])
        if given.get(q["id"], {}).get("answer") == "Not sure"
    ]
    if rnd == 2:
        gaps.append("Areas of the brief that no round 1 question covered (energy, AI governance, DC and cloud, ESG).")
    leaves = await labelled([p["brief_masked"][:1500], *gaps], model, pid)
    qs = await agents.interview(p, leaves, rnd, gaps, len(ans.get("questions", [])) + 1, model)
    ans = {"round": rnd, "questions": ans.get("questions", []) + qs, "given": given}
    db.update("projects", pid, answers=ans, updated_at=db.now())
    for q in qs:
        publish(pid, "question", q)
    if rnd == 2 and not qs:  # no gaps left: go straight to drafting
        return await analyse_step(pid, model)
    refresh(pid)


async def analyse_step(pid: int, model: str) -> None:
    p = project(pid)
    ans = p["answers"]
    publish(pid, "agent_state", {"agent": "Analyst", "state": "thinking"})
    lines = [
        f"{q['id']} {q['text']} -> {ans['given'][q['id']]['answer']}. {ans['given'][q['id']].get('note', '')}"
        for q in ans["questions"]
    ]
    leaves = await labelled(lines, model, pid)
    d = await agents.draft(p, "\n".join(lines), leaves, model)
    labels, retrieved = {e["label"]: e["id"] for e in leaves}, {e["id"]: e["tier"] for e in leaves}
    reqs = [r.model_dump() | {"stakeholder": p["role"]} for r in d.requirements]
    for r in reqs:
        r["evidence"] = [labels.get(x, x) for x in r["evidence"]]  # unknown labels stay and get dropped by rules
    rules.validate(reqs, retrieved)
    issues = d.open_issues + rules.coverage(reqs, [p["area"]])
    hits = rules.injection_hits(p["brief_masked"] + " ".join(lines))
    db.run(
        "INSERT INTO audit(project_id, at, kind, agent, rules) VALUES (?,?,?,?,?)",
        pid,
        db.now(),
        "rules",
        "rules.validate",
        {"flags": {r["id"]: r["flags"] for r in reqs}, "open_issues": issues, "injection": hits},
    )
    db.run("DELETE FROM requirements WHERE project_id=?", pid)
    db.run("DELETE FROM conflicts WHERE project_id=?", pid)
    for r in reqs:
        db.run(
            "INSERT INTO requirements(project_id, rid, data, confidence) VALUES (?,?,?,?)",
            pid,
            r["id"],
            r,
            r["confidence"],
        )
        publish(pid, "requirement", r | {"status": "open", "version": 1})
    art = p["artefacts"] | {
        "risks": [x.model_dump() for x in d.risks],
        "assumptions": d.assumptions,
        "open_issues": issues,
        "evidence": {e["id"]: e for e in leaves},
    }
    db.update("projects", pid, artefacts=art, baseline_version=1, ranking=[], workflow={}, updated_at=db.now())
    notes = await agents.confirm_conflicts(p, reqs, rules.conflict_candidates(reqs), model)
    for n in notes:
        cid = db.run(
            "INSERT INTO conflicts(project_id, a_rid, b_rid, type, explanation, fix) VALUES (?,?,?,?,?,?)",
            pid,
            n["a"],
            n["b"],
            n["type"],
            n["explanation"],
            n["fix"],
        )
        publish(pid, "conflict", n | {"id": cid})
    refresh(pid)


async def plan_step(pid: int, model: str) -> None:
    p = project(pid)
    reqs = [r for r in requirements(pid) if r["status"] != "rejected"]
    publish(pid, "agent_state", {"agent": "Planner", "state": "thinking"})
    factors = await agents.rate_factors(p, reqs, model)
    per, overall = rules.factor_confidence(factors, {r["id"]: r["confidence"] for r in reqs})
    for name, f in factors.items():
        f["confidence"] = per[name]
    ranking = rules.rank({k: v["level"] for k, v in factors.items()})
    wf = await agents.workflow(p, ranking[0]["model"], reqs, model)
    art = p["artefacts"] | {"factor_confidence": overall}
    db.update("projects", pid, factors=factors, ranking=ranking, workflow=wf, artefacts=art, updated_at=db.now())
    publish(pid, "ranking", {"ranking": ranking, "factors": factors, "workflow": wf})
    refresh(pid)


async def workflow_step(pid: int, model: str) -> None:
    """Rewrite only the workflow after a factor change moved a new model to the top."""
    p = project(pid)
    publish(pid, "agent_state", {"agent": "Planner", "state": "thinking"})
    reqs = [r for r in requirements(pid) if r["status"] != "rejected"]
    wf = await agents.workflow(p, p["ranking"][0]["model"], reqs, model)
    db.update("projects", pid, workflow=wf, updated_at=db.now())
    publish(pid, "ranking", {"ranking": p["ranking"], "factors": p["factors"], "workflow": wf})


def save_requirement(p: dict, row: dict, data: dict, status: str) -> dict:
    """Re-check rules for one requirement. New text bumps its version; any change but accept after gate 1
    opens a new baseline (v2, v3...) and locks SDLC again."""
    others = [r for r in requirements(p["id"]) if r["id"] != row["rid"]]
    retrieved = {k: v["tier"] for k, v in p["artefacts"].get("evidence", {}).items()}
    data["flags"] = rules.check(data, retrieved, others)
    data["confidence"] = rules.confidence(data, retrieved)
    version = row["version"] + (data["statement"] != row["data"]["statement"])
    db.update("requirements", row["id"], data=data, status=status, version=version, confidence=data["confidence"])
    if gate_ok(p, 1) and status != "accepted":
        db.update("projects", p["id"], baseline_version=p["baseline_version"] + 1, ranking=[], workflow={})
    refresh(p["id"])
    return data | {"status": status, "version": version}


def act(pid: int, kind: str, detail: dict) -> None:
    """Audit row for a user action (answer, accept, edit, gate...)."""
    db.run(
        "INSERT INTO audit(project_id, at, kind, agent, rules) VALUES (?,?,?,?,?)", pid, db.now(), kind, "user", detail
    )


def read_upload(name: str, body: bytes) -> str:
    """Plain text of an uploaded PDF, TXT or MD file."""
    if name.lower().endswith(".pdf"):
        with pymupdf.open(stream=body, filetype="pdf") as doc:
            return "\n".join(page.get_text() for page in doc)
    if name.lower().endswith((".txt", ".md")):
        return body.decode("utf-8", errors="ignore")
    raise ValueError("Only PDF, TXT or MD files.")
