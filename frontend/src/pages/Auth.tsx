// Sign in / register: split screen, headline + three avatars left, form right; fits a laptop screen without scrolling.
import { type FormEvent, useState } from "react";
import type { User } from "../App";
import { api } from "../api";
import { Avatar } from "../components/ui";

export default function Auth({ mode, onIn }: { mode: string; onIn: (u: User) => void }) {
  const reg = mode === "register";
  const [f, setF] = useState({ name: "", email: reg ? "" : "admin@joules.app", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.password.length < 8) return setErr("At least 8 characters.");
    setBusy(true);
    try {
      await api(`/auth/${reg ? "register" : "login"}`, "POST", f);
      onIn(await api<User>("/me"));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split">
      <div className="l">
        <div style={{ display: "grid", gap: 16 }}>
          <h1 className="display" style={{ maxWidth: "12ch" }}>
            Requirements that cite their sources.
          </h1>
          <p className="muted" style={{ maxWidth: "52ch" }}>
            Three agents interview you, draft requirements from 40+ public standards and laws on energy, AI governance,
            data centres and ESG, then rank seven SDLC models with a score you can recompute by hand.
          </p>
          <div className="trio">
            <Avatar name="Interviewer" />
            <Avatar name="Analyst" />
            <Avatar name="Planner" />
            <span className="muted" style={{ fontSize: 13 }}>
              Interviewer, Analyst, Planner
            </span>
          </div>
        </div>
      </div>
      <div className="r">
        <form className="form" onSubmit={submit} noValidate>
          <h2 style={{ fontSize: 24 }}>{reg ? "Create an account" : "Sign in"}</h2>
          {reg && (
            <div className="field">
              <label htmlFor="nm">Name</label>
              <input className="in" id="nm" autoComplete="name" value={f.name} onChange={set("name")} maxLength={80} />
            </div>
          )}
          <div className="field">
            <label htmlFor="em">Email</label>
            <input className="in" id="em" type="email" autoComplete="email" value={f.email} onChange={set("email")} />
            <span className="help">{reg ? "Used only to sign in." : "Seeded demo user: admin@joules.app"}</span>
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input
              className={`in ${err ? "bad" : ""}`}
              id="pw"
              type="password"
              value={f.password}
              onChange={set("password")}
              autoComplete={reg ? "new-password" : "current-password"}
              aria-describedby="pwe"
            />
            <span className="err" id="pwe" role="alert">
              {err}
            </span>
          </div>
          <button type="submit" className="b pri" style={{ minHeight: 42 }} disabled={busy}>
            {reg ? "Create account" : "Sign in"}
          </button>
          <p className="muted" style={{ fontSize: 13 }}>
            {reg ? (
              <>
                Have an account? <a href="#/login">Sign in</a>
              </>
            ) : (
              <>
                New here? <a href="#/register">Create an account</a>
              </>
            )}
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            5 attempts per minute per IP. Session cookie is HttpOnly.
          </p>
        </form>
      </div>
    </div>
  );
}
