// Right drawer: evidence for the card on top (doc › section › page + snippet) and the audit trace.
import type { Audit, Project } from "../api";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
// One audit row as table cells: step, detail, tokens, ms.
function cells(a: Audit): [string, string, string, string] {
  const ms = a.ms ? (a.ms / 1000).toFixed(1) : ""; // seconds, one decimal
  if (a.kind === "llm") {
    const bad = a.response?.startsWith("error") || a.response?.startsWith("invalid");
    return [
      a.agent?.toLowerCase() ?? "llm",
      `${a.model?.split("/").at(-1)}${bad ? " · failed" : ""}`,
      String(a.tokens_in + a.tokens_out),
      ms,
    ];
  }
  if (a.kind === "rules") {
    const n = Object.values((a.rules?.flags as Record<string, string[]>) || {}).flat().length;
    return ["rules", `${n} findings`, "", ""];
  }
  if (a.kind === "error") return ["error", a.response?.slice(0, 60) ?? "", "", ""];
  const what = a.rules?.rid ?? a.rules?.qid ?? a.rules?.name ?? a.rules?.resolution ?? "";
  const step = a.kind
    .replace("requirement_", "")
    .replace("conflict_", "")
    .replace("regenerate", "regen")
    .replace("_", " ");
  return [step, String(what), "", ""];
}

export default function Drawer({ p, stage, sel }: { p: Project | null; stage: number; sel: string }) {
  const r = p?.requirements.find((x) => x.id === sel);
  const ev = p?.artefacts.evidence || {};
  const leaves = Object.values(ev);
  return (
    <aside className="drawer" data-tour="drawer">
      {r && stage >= 2 && stage <= 4 ? (
        <div>
          <p className="lbl">
            Evidence for <span className="mono">{r.id}</span>
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {r.evidence.map(
              (id) =>
                ev[id] && (
                  <div className="ev" key={id}>
                    <span className="path">{ev[id].ref}</span>
                    <q>{ev[id].snippet}</q>
                    <span className="kv">
                      {ev[id].public ? "public" : "local"} index · {ev[id].tier} ·{" "}
                      <a href={ev[id].link} target="_blank" rel="noreferrer">
                        source
                      </a>
                    </span>
                  </div>
                ),
            )}
            <div className="ev">
              <span className="path">Source quote · {r.source || "none"}</span>
              <q>{r.source_quote || "No quote; needs human review."}</q>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <p className="lbl">Retrieved for this project</p>
          <div className="ev">
            <span className="path">STAIR-lite · BM25 + Chroma RRF · 20 leaves, 3 picked per query</span>
            <span className="mono" style={{ fontSize: 11, lineHeight: 1.7 }}>
              {leaves.length
                ? leaves.slice(0, 6).map((l) => (
                    <span key={l.id} style={{ display: "block" }}>
                      {l.ref.slice(0, 70)}
                    </span>
                  ))
                : "Nothing retrieved yet."}
            </span>
          </div>
        </div>
      )}
      <div>
        <p className="lbl">Trace</p>
        {p?.audit.length ? (
          <div className="ttab">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Step</th>
                  <th>Detail</th>
                  <th title="Tokens in + out">Tok</th>
                  <th title="Seconds">s</th>
                </tr>
              </thead>
              <tbody>
                {p.audit.slice(-16).map((a) => {
                  const [step, detail, tok, ms] = cells(a);
                  return (
                    <tr key={a.id} className={a.kind === "error" ? "bad" : ""}>
                      <td>{time(a.at)}</td>
                      <td>{step}</td>
                      <td title={detail}>{detail}</td>
                      <td>{tok}</td>
                      <td>{ms}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kv">No calls yet.</p>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Full prompts, responses and timings are in the audit table. Deleting the project removes them too.
      </p>
    </aside>
  );
}
