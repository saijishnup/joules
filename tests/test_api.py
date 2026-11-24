"""Full mock run through the API (brief to report), owner checks, caps, SSE stream and delete cascade."""

import time

import pytest
from fastapi.testclient import TestClient

import db
import pipeline
from app import app

BRIEF = (
    "40 MW GPU campus near Hyderabad for enterprise tenants. We must file BRSR Core and buy renewable power. "
    "Contact ops@example.com or +91 98765 43210."
)


def wait(pid: int) -> None:
    for _ in range(200):
        if (t := pipeline.TASKS.get(pid)) is None or t.done():
            assert t is None or t.exception() is None
            return
        time.sleep(0.02)
    raise AssertionError("step did not finish")


@pytest.fixture
def c():
    with TestClient(app) as client:
        client.post("/api/auth/register", json={"email": f"u{time.time_ns()}@test.local", "password": "longpass1"})
        yield client


def answer_all(c, pid):
    s = c.get(f"/api/projects/{pid}").json()
    for q in s["answers"]["questions"]:
        if q["id"] not in s["answers"]["given"]:
            assert c.post(f"/api/projects/{pid}/answers", json={"qid": q["id"], "option": q["recommended"]}).is_success


def test_full_mock_run(c):
    pid = c.post(
        "/api/projects", json={"name": "GPU campus", "role": "Infrastructure architect", "area": "DC & cloud"}
    ).json()["id"]
    assert c.post(f"/api/projects/{pid}/run", json={"brief": BRIEF}).json() == {"started": "interview_step"}
    wait(pid)
    s = c.get(f"/api/projects/{pid}").json()
    assert s["stage"] == 1 and len(s["answers"]["questions"]) == 4 and s["artefacts"]["masked"] == 2
    assert "example.com" not in s["brief_masked"]
    assert c.post(f"/api/projects/{pid}/run", json={}).status_code == 409  # unanswered questions block
    answer_all(c, pid)
    c.post(f"/api/projects/{pid}/run", json={})  # round 2
    wait(pid)
    answer_all(c, pid)
    assert c.post(f"/api/projects/{pid}/run", json={}).json() == {"started": "analyse_step"}
    wait(pid)
    s = c.get(f"/api/projects/{pid}").json()
    assert len(s["requirements"]) == 8 and len(s["conflicts"]) == 2 and s["stage"] == 3
    assert c.post(f"/api/projects/{pid}/gates/1", json={"name": "A", "role": "Architect"}).status_code == 409
    for conf in s["conflicts"]:
        assert c.post(f"/api/projects/{pid}/conflicts/{conf['id']}", json={"resolution": "fix"}).is_success
    rid = s["requirements"][2]["id"]
    assert (
        c.post(f"/api/projects/{pid}/requirements/{rid}/regenerate", json={"feedback": "Add a latency number."}).json()[
            "confidence"
        ]
        > s["requirements"][2]["confidence"]
    )
    assert c.patch(
        f"/api/projects/{pid}/requirements/{s['requirements'][0]['id']}", json={"action": "accept"}
    ).is_success
    assert c.post(f"/api/projects/{pid}/gates/1", json={"name": "Asha", "role": "Architect"}).json() == {"stage": 4}
    wait(pid)
    s = c.get(f"/api/projects/{pid}").json()
    assert s["stage"] == 5 and s["ranking"][0] == s["ranking"][0] | {"model": "Agile-V hybrid", "score": 87}
    assert len(s["workflow"]["phases"]) == 5
    r = c.put(f"/api/projects/{pid}/factors", json={"levels": {"Expected change frequency": "Low"}}).json()
    assert r["ranking"][0]["model"] != "Agile-V hybrid"
    wait(pid)
    assert c.post(f"/api/projects/{pid}/gates/2", json={"name": "Ravi", "role": "Project manager"}).json() == {
        "stage": 6
    }
    s = c.get(f"/api/projects/{pid}").json()
    assert s["gates"] == {"1": True, "2": True} and {a["kind"] for a in s["audit"]} >= {"llm", "rules", "gate_2"}
    assert sum(a["tokens_in"] for a in s["audit"]) > 0
    # editing after approval opens baseline v2 and locks SDLC again
    c.patch(
        f"/api/projects/{pid}/requirements/{rid}", json={"action": "edit", "statement": "The portal shall mask PII."}
    )
    s = c.get(f"/api/projects/{pid}").json()
    assert s["baseline_version"] == 2 and s["gates"] == {"1": False, "2": False} and s["stage"] == 4


def test_owner_check_caps_and_delete(c):
    pid = c.post("/api/projects", json={"name": "Mine", "role": "Product owner", "area": "ESG"}).json()["id"]
    assert c.post(f"/api/projects/{pid}/run", json={"brief": "word " * 1501}).status_code == 422
    with TestClient(app) as other:
        other.post("/api/auth/register", json={"email": f"o{time.time_ns()}@test.local", "password": "longpass1"})
        assert other.get(f"/api/projects/{pid}").status_code == 404
        assert other.delete(f"/api/projects/{pid}").status_code == 404
    assert c.post(f"/api/projects/{pid}/upload?name=notes.txt", content=b"Owner mail a@b.co").json()["masked"] == 1
    assert c.delete(f"/api/projects/{pid}").is_success
    assert not db.q("SELECT id FROM audit WHERE project_id=?", pid)
    assert c.get("/api/projects").json() == [] or all(p["id"] != pid for p in c.get("/api/projects").json())


def test_auth_required_and_demo_login():
    with TestClient(app) as c:
        assert c.get("/api/projects").status_code == 401
        assert c.post(
            "/api/auth/login", json={"email": "admin@joules.app", "password": "demo-pass-for-tests"}
        ).is_success
        assert c.get("/api/me").json()["email"] == "admin@joules.app"


def test_sse_first_event(c):
    pid = c.post("/api/projects", json={"name": "S", "role": "Security lead", "area": "AI governance"}).json()["id"]
    with c.stream("GET", f"/api/projects/{pid}/events") as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        lines = []
        for line in r.iter_lines():
            lines.append(line)
            if line.startswith("data:"):
                break
    assert "event: stage" in lines and 'data: {"stage": 0}' in lines
