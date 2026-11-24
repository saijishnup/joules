// The one-page A4 report (PRD §19). Same markup for the on-screen preview and for print; long lists are capped to fit.
import { useLayoutEffect, useRef, useState } from "react";
import { ist, type Project } from "../api";

const BAND = (c: number) => (c >= 75 ? ["High", "#1F7D71"] : c >= 50 ? ["Medium", "#9A6E00"] : ["Low", "#C2412D"]);
const LV: Record<string, string> = { High: "#C2412D", Medium: "#9A6E00", Low: "#1F7D71" };
// First evidence leaf as "Doc title › p. N", kept short so a row stays on one or two lines.
const cite = (l?: { title: string; ref: string }) => l && `${l.title.slice(0, 34)} › p. ${l.ref.split(" ").at(-1)}`;

export default function Report({ p, licences }: { p: Project; licences: Record<string, string> }) {
  // Exactly one A4 page: drop requirement rows until the sheet stops overflowing (rest stay in the app and JSON).
  const sheet = useRef<HTMLElement>(null);
  const [max, setMax] = useState(12);
  useLayoutEffect(() => {
    const el = sheet.current;
    if (el && el.scrollHeight > el.clientHeight && max > 2) setMax(max - 1);
  });
  const ok = !!p.gates["1"] && !!p.gates["2"];
  const reqs = p.requirements.filter((r) => r.status !== "rejected");
  const r = p.ranking;
  const ev = p.artefacts.evidence || {};
  const d = new Date().toISOString().slice(0, 10);
  const mean = reqs.length ? Math.round(reqs.reduce((s, x) => s + x.confidence, 0) / reqs.length) : 0;
  const resolved = p.conflicts.filter((c) => c.resolution).length;
  return (
    <section className="sheet" ref={sheet}>
      {!ok && <div className="wmk">DRAFT</div>}
      <div className="hd">
        <b>
          joule<span>s</span>
        </b>
        <span>SRS + SDLC report</span>
        <span style={{ marginLeft: "auto" }}>{d}</span>
      </div>
      <div className="ttl">
        <div>
          <h1>{p.name}</h1>
          <p className="sub">
            Stakeholder: {p.role} · Baseline v{Math.max(1, p.baseline_version)} · Main area: {p.area}
          </p>
        </div>
        <span className={ok ? "badge ok" : "badge dr"}>{ok ? "Approved at both gates" : "Draft, not approved"}</span>
      </div>
      {r.length > 0 && (
        <div className="rec">
          <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
            <span className="lbl">Recommended SDLC</span>
            <span className="big">{r[0].model}</span>
            <p className="sub">
              Fits because of {r[0].why}. {r[1].model} is second ({r[1].score}): {r[1].why_not}.
            </p>
            <p className="sub" style={{ fontSize: 10 }}>
              Score = base + Σ weight × factor level (Low 0, Medium 1, High 2), clamped 5 to 97. Same inputs always give
              the same ranking.
            </p>
            <div className="kpis">
              <div>
                <b>{reqs.length}</b>
                <span>requirements</span>
              </div>
              <div>
                <b>
                  {resolved}/{p.conflicts.length}
                </b>
                <span>conflicts resolved</span>
              </div>
              <div>
                <b>{mean}</b>
                <span>mean confidence</span>
              </div>
              <div>
                <b>{new Set(reqs.map((x) => x.area)).size}/4</b>
                <span>areas covered</span>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <div>
              <span className="score">{r[0].score}</span>
              <span className="sub"> / 97</span>
            </div>
            <div className="bars">
              {r.map((x, k) => (
                <div key={x.model} className={k ? "" : "t"}>
                  <span>{x.model}</span>
                  <i style={{ width: `${x.score}%` }} />
                  <span>{x.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {p.workflow.phases && (
        <>
          <h2>Workflow for {p.workflow.model}</h2>
          <div className="ph">
            {p.workflow.phases.slice(0, 5).map((x, k) => (
              <div key={x.name}>
                <b>
                  0{k + 1} {x.name}
                </b>
                {x.activities[0]}
                <br />
                <span className="sub">exit: {x.exit}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <h2>Requirements</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Requirement</th>
            <th>Evidence</th>
            <th>Pri.</th>
            <th>Conf.</th>
          </tr>
        </thead>
        <tbody>
          {reqs.slice(0, max).map((x) => {
            const [b, c] = BAND(x.confidence);
            return (
              <tr key={x.id}>
                <td className="cf">{x.id}</td>
                <td>{x.statement}</td>
                <td className="cf evd">{cite(ev[x.evidence[0]]) || x.source}</td>
                <td>{x.priority}</td>
                <td className="cf" style={{ color: c }}>
                  {x.confidence}
                  <br />
                  {b}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {reqs.length > max && (
        <p className="sub" style={{ fontSize: 10, margin: 0 }}>
          +{reqs.length - max} more requirements in the app and the JSON download.
        </p>
      )}
      <Lower p={p} licences={licences} />
      <div className="ft">
        <span>Generated by Joules from public sources. Not legal advice.</span>
        <span>
          Baseline v{Math.max(1, p.baseline_version)} · {d}
        </span>
      </div>
    </section>
  );
}

/** Bottom half of the sheet: conflicts, approvals, risks and open issues, sources and licences. */
function Lower({ p, licences }: { p: Project; licences: Record<string, string> }) {
  const reqs = p.requirements.filter((r) => r.status !== "rejected");
  const ev = p.artefacts.evidence || {};
  const gate = (n: number) => p.approvals.filter((a) => a.gate === n && a.version === p.baseline_version).at(-1);
  const docs = [...new Set(reqs.flatMap((x) => x.evidence.map((e) => ev[e]?.title)).filter(Boolean))] as string[];
  const issues = [
    ...(p.artefacts.risks ?? []).map((x) => [x.text, x.level]),
    ...(p.artefacts.open_issues ?? []).map((x) => [x, "Open"]),
  ].slice(0, 3);
  return (
    <div className="two">
      <div>
        <h2>Conflicts</h2>
        <table>
          <tbody>
            {p.conflicts.slice(0, 3).map((c, k) => (
              <tr key={c.id}>
                <td className="cf">CF-0{k + 1}</td>
                <td>
                  {c.type}
                  <br />
                  <span className="evd">
                    {c.a_rid} × {c.b_rid}
                  </span>
                </td>
                <td>{c.resolution ? "Resolved" : <span style={{ color: "#C2412D" }}>Open</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Approvals</h2>
        <table>
          <thead>
            <tr>
              <th>Gate</th>
              <th>Decision</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2].map((n) => {
              const g = gate(n);
              return (
                <tr key={n}>
                  <td className="nw">
                    {n} · {n === 1 ? "baseline" : "SDLC"}
                  </td>
                  <td>
                    {g ? (
                      <>
                        Approved v{g.version} <span className="evd">{ist(g.at)} IST</span>
                      </>
                    ) : (
                      "Pending"
                    )}
                  </td>
                  <td>{g ? `${g.name} (${g.role})` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <h2>Risks and open issues</h2>
        <table>
          <tbody>
            {issues.map(([t, l], k) => (
              <tr key={t}>
                <td className="cf">
                  {l === "Open" ? "ISS" : "RSK"}-0{k + 1}
                </td>
                <td>{t}</td>
                <td style={{ color: LV[l] }}>{l}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Sources and licences</h2>
        <p className="sub" style={{ fontSize: 10, margin: 0 }}>
          {docs
            .slice(0, 5)
            .map((t) => `${t}${licences[t] ? ` (${licences[t]})` : ""}`)
            .join(" · ") || "No sources cited yet."}{" "}
          Full table under Terms.
        </p>
      </div>
    </div>
  );
}
