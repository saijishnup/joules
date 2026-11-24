"""Schema, demo user, login, sessions and cascade delete."""

import db


def test_seed_login_session_and_cascade():
    db.init()
    db.init()  # idempotent
    user = db.check_login("DEMO@joules.local", "demo-pass-for-tests")
    assert user and not db.check_login("demo@joules.local", "wrong")
    assert db.session_user(db.new_session(user["id"]))["email"] == "demo@joules.local"
    pid = db.run("INSERT INTO projects(owner_id, name, answers) VALUES (?,?,?)", user["id"], "P", {"Q1": 1})
    assert db.one("SELECT answers FROM projects WHERE id=?", pid)["answers"] == {"Q1": 1}
    db.run("INSERT INTO audit(project_id, kind) VALUES (?,?)", pid, "llm")
    db.run("DELETE FROM projects WHERE id=?", pid)
    assert not db.q("SELECT id FROM audit WHERE project_id=?", pid)
