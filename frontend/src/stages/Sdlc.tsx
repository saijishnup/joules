// SDLC: deterministic ranking (rows slide with motion layout), 13 editable factor ratings, workflow, gate 2.
import { ArrowRight, Check } from "lucide-react";
import { motion } from "motion/react";
import { api, band, type Level, type Rank } from "../api";
import { Avatar } from "../components/ui";
import type { Ctx } from "../pages/Workspace";
import { GateForm } from "./Approve";

const spring = { type: "spring", stiffness: 260, damping: 20 } as const;

export default function Sdlc({ ctx, model }: { ctx: Ctx; model: string }) {
  const { p, reload, agent } = ctx;
  const r = p.ranking;
  const g2 = p.approvals.filter((a) => a.gate === 2 && a.version === p.baseline_version).at(-1);
  const conf = p.artefacts.factor_confidence ?? 0;
  if (!r.length)
    return (
      <div className="who">
        <div>
          <h2>SDLC ranking</h2>
          <p>Planner is rating 13 factors…</p>
        </div>
        <Avatar name="Planner" state="thinking" />
      </div>
    );

  async function setLevel(f: string, level: Level) {
    await api<{ ranking: Rank[] }>(`/projects/${p.id}/factors`, "PUT", { levels: { [f]: level }, model });
    await reload();
  }

  const tie = r[1]?.score === r[0].score;
  const writing = agent.agent === "Planner" && agent.state === "thinking";
  return (
    <>
      <div className="who rise">
        <div>
          <h2>SDLC ranking</h2>
          <p>
            <b style={{ color: "var(--ink)", fontWeight: 500 }}>Planner</b> rated 13 factors citing requirement IDs.
            Change any rating; the score is plain arithmetic in rules.py.
          </p>
        </div>
        <Avatar name="Planner" state={writing ? "thinking" : "speaking"} />
      </div>
      <div className="card rise" style={{ display: "grid", gap: 14 }} data-tour="rank">
        <div className="meta">
          <span>Ranking, 7 models</span>
          <span className="mono">score = base + Σ weight × level (L0 M1 H2), clamped 5–97{tie ? " · tie" : ""}</span>
        </div>
        <div className="rank">
          {r.map((m, i) => (
            <motion.div layout transition={spring} key={m.model} className={`rrow ${i === 0 ? "first" : ""}`}>
              <span style={{ fontWeight: i === 0 ? 600 : 400 }}>{m.model}</span>
              <div className="bar">
                <i style={{ width: `${m.score}%`, animationDelay: `${i * 50}ms` }} />
              </div>
              <span className="mono" style={{ textAlign: "right" }}>
                {m.score}
              </span>
            </motion.div>
          ))}
        </div>
        <p style={{ fontSize: 14 }}>
          <b style={{ fontWeight: 600 }}>{r[0].model}</b> fits because of {r[0].why}.{" "}
          <span className="muted">
            {r[1].model} is second: {r[1].why_not}.
          </span>
        </p>
      </div>
      <div className="rise">
        <p className="lbl">
          Factor ratings · overall confidence{" "}
          <span className="mono" style={{ color: `var(${band(conf)[1]})` }}>
            {conf} {band(conf)[0]}
          </span>
        </p>
        <div className="factors">
          {Object.entries(p.factors).map(([f, v]) => (
            <div className="fac" key={f}>
              <span title={`${v.why} Cites: ${v.cites.join(", ") || "none"}`}>{f}</span>
              <fieldset className="seg" aria-label={f}>
                {(["Low", "Medium", "High"] as Level[]).map((l) => (
                  <button
                    type="button"
                    key={l}
                    className={v.level === l ? "on" : ""}
                    aria-pressed={v.level === l}
                    onClick={() => setLevel(f, l)}
                  >
                    {l[0]}
                  </button>
                ))}
              </fieldset>
            </div>
          ))}
        </div>
      </div>
      <div className="rise">
        <p className="lbl">
          Workflow for {p.workflow.model}
          {writing ? " · Planner is rewriting it for the new top model" : ""}
        </p>
        {p.workflow.summary && (
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            {p.workflow.summary}
          </p>
        )}
        <div className="phases">
          {p.workflow.phases?.map((ph, i) => (
            <div className="phase" key={ph.name}>
              <span className="kv">0{i + 1}</span>
              <h4>{ph.name}</h4>
              <ul>
                <li>{ph.activities.join(", ")}</li>
                <li>Role: {ph.roles.join(", ")}</li>
                <li>Checks: {ph.checkpoints.join(", ")}</li>
                <li>Exit: {ph.exit}</li>
              </ul>
            </div>
          ))}
        </div>
      </div>
      {g2 ? (
        <div className="gate ok">
          <Check />
          <span>
            Gate 2: <b>{r[0].model}</b> approved by {g2.name} ({g2.role}).
          </span>
          <a className="b pri" style={{ marginLeft: "auto" }} href={`#/p/${p.id}/6`}>
            Export <ArrowRight />
          </a>
        </div>
      ) : (
        <GateForm p={p} gate={2} model={model} label={`Approve ${r[0].model}`} onDone={reload} />
      )}
    </>
  );
}
