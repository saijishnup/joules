// Requirements: deck of drafted requirements, traceability matrix, risks and open issues (FR-05 to FR-08).
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import Deck from "../components/Deck";
import { Avatar } from "../components/ui";
import type { Ctx } from "../pages/Workspace";
import ReqCard from "./ReqCard";

const LV: Record<string, string> = { High: "--lo", Medium: "--med", Low: "--hi" };

export default function Requirements({ ctx, model }: { ctx: Ctx; model: string }) {
  const { p, reload, sel, setSel } = ctx;
  const reqs = p.requirements;
  const [tab, setTab] = useState("list");
  const i = Math.max(
    0,
    reqs.findIndex((r) => r.id === sel),
  );
  const reviewed = reqs.filter((r) => r.status !== "open").length;
  const ev = p.artefacts.evidence || {};

  async function done(moved: boolean) {
    await reload();
    const next = reqs.findIndex((r, j) => j > i && r.status === "open");
    if (moved && next >= 0) setSel(reqs[next].id);
  }

  return (
    <>
      <div className="who rise">
        <div>
          <h2>Requirements</h2>
          <p>
            <b style={{ color: "var(--ink)", fontWeight: 500 }}>Analyst</b> drafted {reqs.length} requirements from{" "}
            {Object.keys(ev).length} source sections. {reviewed} of {reqs.length} reviewed.
          </p>
        </div>
        <Avatar name="Analyst" state={reviewed < reqs.length ? "thinking" : "idle"} />
      </div>
      <div className="tabs rise" role="tablist">
        {[
          ["list", "Requirements"],
          ["rtm", "Traceability"],
          ["risk", "Risks and open issues"],
        ].map(([k, l]) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === k}
            key={k}
            className={tab === k ? "on" : ""}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "list" && reqs[i] && (
        <Deck
          n={reqs.length}
          i={i}
          setI={(j) => setSel(reqs[j].id)}
          cardKey={reqs[i].id}
          marks={reqs.map((r) => [
            r.id,
            r.status === "accepted" || r.status === "edited" ? "ok" : r.status === "rejected" ? "no" : "",
          ])}
        >
          <ReqCard r={reqs[i]} pid={p.id} model={model} onDone={done} />
        </Deck>
      )}
      {tab === "rtm" && (
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Req</th>
                <th>Source quote</th>
                <th>Evidence leaf</th>
                <th>Conflicts</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>
                    {r.source}
                    {r.source_quote && <span className="muted"> "{r.source_quote}"</span>}
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {r.evidence.map((e) => (
                      <span key={e} style={{ display: "block" }}>
                        {ev[e]?.ref ?? e}
                      </span>
                    ))}
                  </td>
                  <td className="mono">
                    {p.conflicts.filter((c) => c.a_rid === r.id || c.b_rid === r.id).length || "–"}
                  </td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "risk" && (
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Risk, assumption or open issue</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              {p.artefacts.risks?.map((r, k) => (
                <tr key={r.text}>
                  <td className="mono">RSK-{String(k + 1).padStart(2, "0")}</td>
                  <td>{r.text}</td>
                  <td style={{ color: `var(${LV[r.level]})` }}>{r.level}</td>
                </tr>
              ))}
              {p.artefacts.assumptions?.map((a, k) => (
                <tr key={a}>
                  <td className="mono">ASM-{String(k + 1).padStart(2, "0")}</td>
                  <td>{a}</td>
                  <td className="muted">Assumed</td>
                </tr>
              ))}
              {p.artefacts.open_issues?.map((a, k) => (
                <tr key={a}>
                  <td className="mono">ISS-{String(k + 1).padStart(2, "0")}</td>
                  <td>{a}</td>
                  <td className="muted">Open</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        ← → to move. Evidence for the card on top is in the right panel.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <a className="b pri" href={`#/p/${p.id}/3`}>
          Check conflicts <ArrowRight />
        </a>
      </div>
    </>
  );
}
