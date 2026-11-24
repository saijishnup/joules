// Right drawer: evidence for the card on top (doc › section › page + snippet) and the audit trace.
import type { Audit, Project } from "../api";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
function line(a: Audit) {
  if (a.kind === "llm") {
    const bad = a.response?.startsWith("error") || a.response?.startsWith("invalid");
    return (
      <>
        {a.agent?.toLowerCase()} · <b>{a.model}</b> · {a.tokens_in} in / {a.tokens_out} out tok · {a.ms} ms
        {bad ? " · failed, next model" : ""}
      </>
    );
  }
  if (a.kind === "rules")
    return (
      <>rules.validate · {Object.values((a.rules?.flags as Record<string, string[]>) || {}).flat().length} findings</>
    );
  if (a.kind === "error") return <b style={{ color: "var(--lo)" }}>error · {a.response?.slice(0, 80)}</b>;
  return (
    <>
      {a.kind.replace("_", " ")} · <b>{String(a.rules?.rid ?? a.rules?.qid ?? a.rules?.name ?? "")}</b>
    </>
  );
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
        <div className="trace">
          {(p?.audit ?? []).slice(-14).map((a) => (
            <span key={a.id}>
              {time(a.at)} {line(a)}
            </span>
          ))}
          {!p?.audit.length && <span>No calls yet.</span>}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Full prompts, responses and timings are in the audit table. Deleting the project removes them too.
      </p>
    </aside>
  );
}
