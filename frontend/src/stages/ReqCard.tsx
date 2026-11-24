// One requirement card: statement, acceptance, story, rule flags, chips, confidence, and accept / edit / regenerate / reject.
import { AlertTriangle, Check, Pencil, RotateCw, X } from "lucide-react";
import { useState } from "react";
import { api, band, type Req, words } from "../api";
import { Chip } from "../components/ui";

type Props = { r: Req; pid: number; model: string; onDone: (moved: boolean) => void };

export default function ReqCard({ r, pid, model, onDone }: Props) {
  const [mode, setMode] = useState<"" | "edit" | "regen">("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [b, color] = band(r.confidence);
  const cap = mode === "edit" ? 60 : 100;

  async function act(action: string) {
    setBusy(true);
    setErr("");
    try {
      if (action === "regen")
        await api(`/projects/${pid}/requirements/${r.id}/regenerate`, "POST", { feedback: text, model });
      else await api(`/projects/${pid}/requirements/${r.id}`, "PATCH", { action, statement: text });
      setMode("");
      onDone(action === "accept" || action === "reject");
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const done = ["accepted", "rejected"].includes(r.status);
  return (
    <article className={`card req ${r.status}`}>
      <div className="meta">
        <span className="mono">
          {r.id} · {r.type} · {r.priority}
          {r.version > 1 ? ` · v${r.version}` : ""}
        </span>
        <span className="mono" style={{ color: `var(${color})` }} title="Confidence, computed by code">
          {r.confidence} {b}
          {r.confidence < 50 ? " · needs human review" : ""}
        </span>
      </div>
      <p className="stmt">{r.statement}</p>
      <p className="ac">
        <b style={{ color: "var(--ink)", fontWeight: 500 }}>Acceptance.</b> {r.acceptance}
      </p>
      {r.user_story && <p className="ac">{r.user_story}</p>}
      {r.flags.length > 0 && (
        <div className="flag">
          <AlertTriangle />
          {r.flags.join(" · ")}
        </div>
      )}
      <div className="chips">
        <Chip t={r.area} />
        {r.categories.map((c) => (
          <Chip key={c} t={c} />
        ))}
        <Chip t={r.stakeholder} />
      </div>
      {mode && (
        <div className="field">
          <label htmlFor="rq">{mode === "edit" ? "New statement" : "What should change?"}</label>
          <textarea className="in" id="rq" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <span className="cnt" style={{ color: words(text) > cap ? "var(--lo)" : undefined }}>
            {words(text)} / {cap} words
          </span>
        </div>
      )}
      {err && (
        <span className="err" role="alert">
          {err}
        </span>
      )}
      <div className="acts">
        {mode ? (
          <>
            <button
              type="button"
              className="b pri"
              disabled={busy || !text.trim()}
              onClick={() => act(mode === "edit" ? "edit" : "regen")}
            >
              {busy ? "Working…" : mode === "edit" ? "Save edit" : "Regenerate (1 LLM call)"}
            </button>
            <button type="button" className="b ghost" onClick={() => setMode("")}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {done && (
              <span className="kv" style={{ alignSelf: "center" }}>
                {r.status === "accepted" ? "Accepted" : "Rejected"} ·
              </span>
            )}
            {r.status !== "accepted" && (
              <button type="button" className="b pri" disabled={busy} onClick={() => act("accept")}>
                <Check />
                Accept
              </button>
            )}
            <button
              type="button"
              className="b"
              onClick={() => {
                setText(r.statement);
                setMode("edit");
              }}
            >
              <Pencil />
              Edit
            </button>
            <button
              type="button"
              className="b"
              onClick={() => {
                setText("");
                setMode("regen");
              }}
            >
              <RotateCw />
              Regenerate
            </button>
            {r.status !== "rejected" && (
              <button type="button" className="b red" disabled={busy} onClick={() => act("reject")}>
                <X />
                Reject
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
