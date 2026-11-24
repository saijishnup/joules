"""Schema, demo user, login, sessions and cascade delete."""

import db


def test_seed_login_session_and_cascade():
    db.init()
    db.init()  # idempotent
    user = db.check_login("ADMIN@joules.app", "demo-pass-for-tests")
    assert user and not db.check_login("admin@joules.app", "wrong")
    assert db.session_user(db.new_session(user["id"]))["email"] == "admin@joules.app"
    pid = db.run("INSERT INTO projects(owner_id, name, answers) VALUES (?,?,?)", user["id"], "P", {"Q1": 1})
    assert db.one("SELECT answers FROM projects WHERE id=?", pid)["answers"] == {"Q1": 1}
    db.run("INSERT INTO audit(project_id, kind) VALUES (?,?)", pid, "llm")
    db.run("DELETE FROM projects WHERE id=?", pid)
    assert not db.q("SELECT id FROM audit WHERE project_id=?", pid)


def test_new_account_gets_four_templates():
    db.init()
    uid = db.add_user("t@test.local", "T", "longpass1")
    rows = db.q("SELECT name, stage, brief_masked FROM projects WHERE owner_id=?", uid)
    assert len(rows) == 4 and all(r["stage"] == 0 and r["brief_masked"] for r in rows)
    assert "example.in" not in rows[0]["brief_masked"]  # template briefs are masked like any brief
