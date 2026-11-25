// About page: Joules at a glance with compact visuals (flow, agents, LLM vs code, numbers, two diagrams).
import { Sequence, UseCase } from "../components/Diagrams";
import { Avatar, Footer } from "../components/ui";

// [step, what happens, human step?]
const FLOW: [string, string, boolean][] = [
  ["Brief", "Role, text, optional files", false],
  ["Interview", "Cards fill the gaps", false],
  ["Requirements", "Cited, scored by code", false],
  ["Conflicts", "Trade-offs resolved", false],
  ["Gate 1", "Approve the baseline", true],
  ["SDLC rank", "7 models, 13 factors", false],
  ["Gate 2", "Approve the choice", true],
  ["Report", "One A4 page + JSON", false],
];
const AGENTS = [
  ["Interviewer", "Asks 3 to 4 multiple-choice cards per round, tailored to the role. Round 2 covers gaps only."],
  ["Analyst", "Drafts requirements with cited evidence, confirms conflicts, rewrites on feedback."],
  ["Planner", "Rates 13 SDLC factors, then writes the workflow for the chosen model."],
] as const;
const LLM = ["Interview questions", "Requirement wording", "Conflict explanations", "Factor ratings", "Workflow text"];
const CODE = [
  "Masking personal data",
  "IDs and wording checks",
  "Confidence 0 to 100",
  "Citation check",
  "SDLC score",
  "Gates",
];
const STATS = [
  ["3", "agents"],
  ["40+", "public sources"],
  ["7", "SDLC models"],
  ["13", "factors"],
  ["2", "human gates"],
];

export default function About() {
  return (
    <div className="page about">
      <div>
        <p className="lbl">About</p>
        <h1 className="display">Joules</h1>
        <p className="muted">
          Interviews a stakeholder, drafts cited requirements, ranks seven SDLC models. People approve.
        </p>
      </div>
      <div className="stats rise">
        {STATS.map(([n, t]) => (
          <div key={t}>
            <b className="mono">{n}</b>
            <span>{t}</span>
          </div>
        ))}
      </div>
      <section>
        <h2>From brief to report</h2>
        <ol className="flow">
          {FLOW.map(([s, d, human], i) => (
            <li key={s} className={human ? "g" : ""}>
              <span className="mono">{String(i + 1).padStart(2, "0")}</span>
              <b>{s}</b>
              <small>{d}</small>
              {human && <em>human gate</em>}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2>Three agents</h2>
        <div className="agents">
          {AGENTS.map(([n, d]) => (
            <div key={n} className="box">
              <Avatar name={n} />
              <h3>{n}</h3>
              <p className="muted">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>The LLM proposes, code verifies</h2>
        <div className="split">
          <div className="box">
            <h3>LLM writes</h3>
            <ul>
              {LLM.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="box">
            <h3>Code decides</h3>
            <ul>
              {CODE.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section>
        <h2>Use cases</h2>
        <div className="dia">
          <UseCase />
        </div>
      </section>
      <section>
        <h2>Sequence of one run</h2>
        <div className="dia">
          <Sequence />
        </div>
      </section>
      <Footer />
    </div>
  );
}
