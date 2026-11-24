// Conflicts: deck of confirmed tension pairs; each needs a resolution before gate 1 opens (FR-09, FR-10).
import { ArrowRight, Check, Lock, Zap } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import Deck from "../components/Deck";
import { Avatar } from "../components/ui";
import type { Ctx } from "../pages/Workspace";

const LABEL: Record<string, string> = { fix: "fix accepted", edit: "requirement edited", risk: "risk accepted" };

export default function Conflicts({ ctx }: { ctx: Ctx }) {
  const { p, reload, setSel } = ctx;
  const cs = p.conflicts;
  const firstOpen = cs.findIndex((c) => !c.resolution);
  const [i, setI] = useState(Math.max(0, firstOpen));
  const [note, setNote] = useState("");
  const [askNote, setAskNote] = useState(false);
  const [err, setErr] = useState("");
  const c = cs[i];
  const stmt = (rid: string) => p.requirements.find((r) => r.id === rid)?.statement ?? rid;
  const ok = cs.every((x) => x.resolution);

  async function resolve(resolution: string) {
    try {
      await api(`/projects/${p.id}/conflicts/${c.id}`, "POST", { resolution, note });
      setNote("");
      setAskNote(false);
      setErr("");
      await reload();
      const next = cs.findIndex((x, j) => j !== i && !x.resolution);
      if (next >= 0) setI(next);
      if (resolution === "edit") {
        setSel(c.a_rid);
        location.hash = `#/p/${p.id}/2`;
      }
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <>
      <div className="who rise">
        <div>
          <h2>Conflicts</h2>
          <p>
            Code flagged tension pairs across areas; the Analyst confirmed {cs.length}. Resolve all to unlock approval.
          </p>
        </div>
        <Avatar name="Analyst" />
      </div>
      {c ? (
        <Deck
          n={cs.length}
          i={i}
          setI={setI}
          cardKey={String(c.id)}
          marks={cs.map((x) => [String(x.id), x.resolution ? "ok" : ""])}
        >
          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div className="meta">
              <span className="mono">
                CF-{String(i + 1).padStart(2, "0")} · {c.type}
              </span>
              <span>
                {c.resolution ? <span style={{ color: "var(--hi)" }}>Resolved: {LABEL[c.resolution]}</span> : "Open"}
              </span>
            </div>
            <div className="pair">
              <div className="side">
                <span className="mono kv">{c.a_rid}</span>
                <p>{stmt(c.a_rid)}</p>
              </div>
              <div className="vs">
                <Zap />
              </div>
              <div className="side">
                <span className="mono kv">{c.b_rid}</span>
                <p>{stmt(c.b_rid)}</p>
              </div>
            </div>
            <p style={{ fontSize: 14 }}>{c.explanation}</p>
            <p className="ac">
              <b style={{ color: "var(--ink)", fontWeight: 500 }}>Suggested fix.</b> {c.fix || "None suggested."}
            </p>
            {c.note && <p className="ac">Note: {c.note}</p>}
            {askNote && (
              <div className="field">
                <label htmlFor="cn">Why is this risk acceptable?</label>
                <textarea
                  className="in"
                  id="cn"
                  rows={2}
                  maxLength={600}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            )}
            {err && (
              <span className="err" role="alert">
                {err}
              </span>
            )}
            {!c.resolution && (
              <div className="acts">
                <button type="button" className="b pri" onClick={() => resolve("fix")}>
                  Accept fix
                </button>
                <button type="button" className="b" onClick={() => resolve("edit")}>
                  Edit a requirement
                </button>
                <button type="button" className="b" onClick={() => (askNote ? resolve("risk") : setAskNote(true))}>
                  {askNote ? "Save risk note" : "Accept risk with note"}
                </button>
              </div>
            )}
          </div>
        </Deck>
      ) : (
        <div className="empty">
          <h3>No conflicts found</h3>
          <p className="muted">No tension pair was confirmed between areas.</p>
        </div>
      )}
      <div className={`gate ${ok ? "ok" : ""}`}>
        {ok ? <Check /> : <Lock />}
        <span>
          {ok ? "All conflicts resolved. Gate 1 is open." : "Gate 1 stays locked until every conflict is resolved."}
        </span>
        {ok && (
          <a className="b pri" style={{ marginLeft: "auto" }} href={`#/p/${p.id}/4`}>
            Go to approval <ArrowRight />
          </a>
        )}
      </div>
    </>
  );
}
