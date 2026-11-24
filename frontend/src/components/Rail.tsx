// Left rail: recent projects, 7-stage stepper (done / current / locked), run stats from the audit log.
import { Check, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Project, type ProjectRow, STAGES } from "../api";

export default function Rail({ p, stage }: { p: Project | null; stage: number }) {
  const [recent, setRecent] = useState<ProjectRow[]>([]);
  useEffect(() => {
    api<ProjectRow[]>("/projects").then(
      (r) => setRecent(r.slice(0, 3)),
      () => {},
    );
  }, []);
  const top = p?.stage ?? 0;
  const locked = (i: number) => i > top && i !== 6;
  const done = (i: number) => !!p && (i === 4 ? !!p.gates["1"] : i === 5 ? !!p.gates["2"] : i === 6 ? false : i < top);
  const llm = p?.audit.filter((a) => a.kind === "llm") ?? [];
  const tokens = llm.reduce((s, a) => s + a.tokens_in + a.tokens_out, 0);
  return (
    <aside className="rail">
      <div className="hide">
        <p className="lbl">Projects</p>
        {recent.map((x) => (
          <a key={x.id} className={`proj ${x.id === p?.id ? "on" : ""}`} href={`#/p/${x.id}/${x.stage}`}>
            {x.name}
          </a>
        ))}
        <a className="proj" href="#/new">
          + New project
        </a>
      </div>
      <div data-tour="stepper">
        <p className="lbl hide">Stage</p>
        <ol className="steps">
          {STAGES.map((s, i) => (
            <li key={s} className={`${i === stage ? "on" : ""} ${done(i) ? "done" : ""} ${locked(i) ? "lock" : ""}`}>
              <a href={p ? `#/p/${p.id}/${i}` : "#/new"} title={s} aria-current={i === stage ? "step" : undefined}>
                <i>{done(i) && i !== stage && <Check />}</i>
                <span className="hide">{s}</span>
                {locked(i) && (
                  <span className="hide" style={{ marginLeft: "auto" }}>
                    <Lock />
                  </span>
                )}
              </a>
            </li>
          ))}
        </ol>
      </div>
      {p && (
        <div className="hide">
          <p className="lbl">Run</p>
          <div className="trace">
            <span>
              stakeholder <b>{p.role}</b>
            </span>
            <span>
              masked <b>{p.artefacts.masked ?? 0} items</b>
            </span>
            <span>
              LLM calls <b>{llm.length} / 60 h</b>
            </span>
            <span>
              tokens <b>{tokens.toLocaleString("en-IN")}</b>
            </span>
            <span>
              baseline <b>v{Math.max(1, p.baseline_version)}</b>
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
