// Gate 1: a named human signs the requirement baseline. GateForm is shared with gate 2 on the SDLC stage.
import { ArrowRight, Check } from "lucide-react";
import { type FormEvent, useState } from "react";
import { APPROVERS, api, band, ist, type Project } from "../api";
import type { Ctx } from "../pages/Workspace";

export function GateForm({
  p,
  gate,
  model,
  label,
  onDone,
}: {
  p: Project;
  gate: 1 | 2;
  model: string;
  label: string;
  onDone: () => void;
}) {
  const [f, setF] = useState({ name: "", role: APPROVERS[gate === 1 ? 1 : 0], comment: "" });
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErr("Approver name is required.");
    try {
      await api(`/projects/${p.id}/gates/${gate}`, "POST", { ...f, model });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  return (
    <form className="card" style={{ display: "grid", gap: 14, maxWidth: 560 }} onSubmit={submit}>
      <div className="field">
        <label htmlFor={`an${gate}`}>Approver name</label>
        <input
          className="in"
          id={`an${gate}`}
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          maxLength={80}
        />
      </div>
      <div className="field">
        <label htmlFor={`ar${gate}`}>Role</label>
        <select className="in" id={`ar${gate}`} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {APPROVERS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <span className="help">Declared, not enforced (single-user scope).</span>
      </div>
      <div className="field">
        <label htmlFor={`ac${gate}`}>Comment</label>
        <textarea
          className="in"
          id={`ac${gate}`}
          rows={3}
          maxLength={600}
          value={f.comment}
          onChange={(e) => setF({ ...f, comment: e.target.value })}
        />
        <span className="err" role="alert">
          {err}
        </span>
      </div>
      <div className="acts">
        <button type="submit" className="b pri">
          <Check />
          {label}
        </button>
      </div>
    </form>
  );
}

export default function Approve({ ctx, model }: { ctx: Ctx; model: string }) {
  const { p, reload, agent } = ctx;
  const live = p.requirements.filter((r) => r.status !== "rejected");
  const mean = live.length ? Math.round(live.reduce((s, r) => s + r.confidence, 0) / live.length) : 0;
  const low = live.filter((r) => r.confidence < 50).length;
  const areas = new Set(live.map((r) => r.area)).size;
  const g = p.approvals.filter((a) => a.gate === 1 && a.version === p.baseline_version).at(-1);
  const planning = p.running || agent.agent === "Planner";
  return (
    <>
      <div className="who rise">
        <div>
          <h2>Approve baseline</h2>
          <p>
            Gate 1 of 2. A named human signs the requirement baseline. Editing later reopens it as v
            {p.baseline_version + 1}.
          </p>
        </div>
      </div>
      <div className="tiles rise">
        <div className="card tile">
          <span className="lbl">Baseline</span>
          <b>{g ? `v${p.baseline_version}` : "draft"}</b>
          <span className="muted" style={{ fontSize: 12 }}>
            {live.length} requirements, {p.conflicts.length} conflicts resolved
          </span>
        </div>
        <div className="card tile">
          <span className="lbl">Mean confidence</span>
          <b style={{ color: `var(${band(mean)[1]})` }}>{mean}</b>
          <span className="muted" style={{ fontSize: 12 }}>
            {low} Low need review
          </span>
        </div>
        <div className="card tile">
          <span className="lbl">Coverage</span>
          <b>{areas}/4</b>
          <span className="muted" style={{ fontSize: 12 }}>
            areas with a requirement
          </span>
        </div>
      </div>
      {g ? (
        <div className="gate ok">
          <Check />
          <span>
            Approved by <b>{g.name}</b> ({g.role}) at {ist(g.at)} IST.{g.comment && ` "${g.comment}"`}
            {planning && " Planner is rating factors."}
          </span>
          {!planning && (
            <a className="b pri" style={{ marginLeft: "auto" }} href={`#/p/${p.id}/5`}>
              Rank SDLC <ArrowRight />
            </a>
          )}
        </div>
      ) : (
        <GateForm
          p={p}
          gate={1}
          model={model}
          label={`Approve baseline v${Math.max(1, p.baseline_version)}`}
          onDone={reload}
        />
      )}
    </>
  );
}
