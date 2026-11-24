// Interview: one question card at a time, keys 1 to 4, "Not sure" always present, optional free-text note.
import { ArrowUp, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { api, words } from "../api";
import Deck from "../components/Deck";
import ModelPicker from "../components/ModelPicker";
import { Avatar } from "../components/ui";
import type { Ctx } from "../pages/Workspace";

export default function Interview({
  ctx,
  model,
  setModel,
}: {
  ctx: Ctx;
  model: string;
  setModel: (m: string) => void;
}) {
  const { p, reload, run, agent } = ctx;
  const qs = p.answers.questions ?? [];
  const given = p.answers.given ?? {};
  const firstOpen = qs.findIndex((q) => !given[q.id]);
  const [i, setI] = useState(firstOpen < 0 ? Math.max(0, qs.length - 1) : firstOpen);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const q = qs[i];
  const busy = p.running || agent.state === "thinking";
  const allDone = qs.length > 0 && firstOpen < 0;
  const pending = allDone && p.stage === 1; // answered, but the next step has not run yet (e.g. after an error)

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when a round adds questions
  useEffect(() => {
    // a new round arrived: jump to its first open question
    if (firstOpen >= 0) setI(firstOpen);
  }, [qs.length]);

  async function answer(option: number) {
    if (!q || busy || p.stage > 1) return; // answers are frozen once the Analyst has drafted
    if (words(note) > 100) return setErr("The note is over 100 words.");
    try {
      await api(`/projects/${p.id}/answers`, "POST", { qid: q.id, option, note });
      setNote("");
      setErr("");
      await reload();
      const next = qs.findIndex((x, j) => j !== i && !given[x.id]);
      if (next >= 0) setI(next);
      else await run(); // last answer: round 2 questions or the Analyst's draft
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (/^[1-4]$/.test(e.key) && !/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)) answer(Number(e.key) - 1);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const status = busy
    ? agent.agent === "Analyst"
      ? "Analyst is drafting requirements from your answers."
      : "Interviewer is preparing questions."
    : allDone
      ? pending
        ? "All answered. Run the next step."
        : "Interview complete."
      : `Question ${i + 1} of ${qs.length}, round ${p.answers.round ?? 1}.`;
  return (
    <>
      <div className="who rise">
        <div>
          <h2>Interview</h2>
          <p>
            <b style={{ color: "var(--ink)", fontWeight: 500 }}>Interviewer</b>{" "}
            {q ? `is asking about ${q.topic}. ` : ""}
            {status}
          </p>
        </div>
        <Avatar
          name={busy && agent.agent === "Analyst" ? "Analyst" : "Interviewer"}
          state={busy ? "thinking" : "speaking"}
        />
      </div>
      {q && (
        <Deck
          n={qs.length}
          i={i}
          setI={setI}
          marks={qs.map((x) => [x.id, given[x.id] ? "ok" : ""])}
          lockNext={!given[q.id]}
          cardKey={q.id}
        >
          <div className="card q">
            <div className="meta">
              <span className="mono">
                {q.id} · {q.topic}
              </span>
              <span>round {p.answers.round ?? 1}</span>
            </div>
            <h3>{q.text}</h3>
            <p className="why">{q.why}</p>
            <div className="opts">
              {q.options.map((o, j) => (
                <button
                  type="button"
                  key={o}
                  className={`opt ${given[q.id]?.option === j ? "sel" : ""}`}
                  onClick={() => answer(j)}
                  disabled={busy || p.stage > 1}
                >
                  <kbd>{j + 1}</kbd>
                  <span>{o}</span>
                  {j === q.recommended && <em>Recommended</em>}
                </button>
              ))}
            </div>
          </div>
        </Deck>
      )}
      {err && (
        <span className="err" role="alert">
          {err}
        </span>
      )}
      {pending && !busy && (
        <button type="button" className="b pri" onClick={() => run()}>
          Continue
        </button>
      )}
      <p className="muted rise" style={{ fontSize: 12 }}>
        Press 1 to 4, ← → to move. "Not sure" is always an answer. Round 2 only asks about gaps.
      </p>
      <div className="comp rise" style={{ marginTop: "auto" }} data-tour="composer">
        <button type="button" className="ib" style={{ border: 0 }} aria-label="Attach" disabled>
          <Paperclip />
        </button>
        <input
          placeholder="Optional note with your answer"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note"
        />
        <span className="cnt" style={{ color: words(note) > 100 ? "var(--lo)" : undefined }}>
          {words(note)} / 100 words
        </span>
        <ModelPicker model={model} setModel={setModel} />
        <button
          type="button"
          className="send"
          aria-label="Send note with recommended option"
          onClick={() => q && answer(q.recommended)}
        >
          <ArrowUp />
        </button>
      </div>
    </>
  );
}
