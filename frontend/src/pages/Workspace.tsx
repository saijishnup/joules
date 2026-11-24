// Workspace: rail (projects, 7-stage stepper with locks, run stats) + canvas (current stage) + drawer (evidence, trace).
import { useEffect, useRef, useState } from "react";
import { api, type Project, useProject } from "../api";
import Drawer from "../components/Drawer";
import Rail from "../components/Rail";
import { Locked, Toaster } from "../components/ui";
import Approve from "../stages/Approve";
import Brief from "../stages/Brief";
import Conflicts from "../stages/Conflicts";
import Export from "../stages/Export";
import Interview from "../stages/Interview";
import Requirements from "../stages/Requirements";
import Sdlc from "../stages/Sdlc";

export type Ctx = {
  p: Project;
  reload: () => Promise<void>;
  model: string;
  setModel: (m: string) => void;
  agent: { agent: string | null; state: string };
  run: (body?: object) => Promise<void>;
  sel: string;
  setSel: (rid: string) => void;
};
const LOCK = [
  "",
  "Write the brief and start the interview first.",
  "Answer the interview questions first; the Analyst drafts after the last answer.",
  "Answer the interview questions first; conflicts are checked with the requirements.",
  "Resolve every conflict first. Gate 1 cannot be signed while a conflict is open.",
  "Approve the requirement baseline (gate 1) first. The Planner rates factors right after.",
];
const STAGE_VIEWS = [Brief, Interview, Requirements, Conflicts, Approve, Sdlc, Export];

export default function Workspace({ id, stage, mini }: { id: number | null; stage: number; mini: boolean }) {
  const { p, reload, agent, error, setError } = useProject(id);
  const [model, setModelState] = useState(localStorage.getItem("joules-model") || "mock");
  const [sel, setSel] = useState("");
  const setModel = (m: string) => {
    localStorage.setItem("joules-model", m);
    setModelState(m);
  };

  useEffect(() => {
    if (p?.requirements.length && !p.requirements.some((r) => r.id === sel)) setSel(p.requirements[0].id);
  }, [p, sel]);
  // Follow the pipeline only when it moves while you watch: brief to interview, last answer to requirements.
  const seen = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to stage changes only
  useEffect(() => {
    if (!p || !id) return;
    const before = seen.current ?? (stage === 0 ? 0 : p.stage);
    seen.current = p.stage;
    if (p.stage <= before) return;
    if (stage === 0 && p.stage === 1) location.hash = `#/p/${id}/1`;
    else if (stage === 1 && p.stage >= 3) location.hash = `#/p/${id}/2`;
  }, [p?.stage]);

  async function run(body: object = {}) {
    setError("");
    await api(`/projects/${p?.id}/run`, "POST", { model, ...body }).catch((e) => setError(e.message));
  }

  if (id && !p)
    return (
      <div className="ws">
        <div className="rail" />
        <section className="canvas">
          <div className="card skel" style={{ height: 220 }} />
        </section>
      </div>
    );
  const locked = p ? stage > p.stage && stage !== 6 : stage > 0;
  const View = STAGE_VIEWS[stage] || Brief;
  const ctx = p && { p, reload, model, setModel, agent, run, sel, setSel };
  return (
    <div className={`ws ${mini ? "mini" : ""}`}>
      <Rail p={p} stage={stage} />
      <section className="canvas">
        {error && (
          <div className="gate" role="alert" style={{ borderColor: "var(--lo)", color: "var(--lo)" }}>
            {error}
          </div>
        )}
        {!p ? (
          <Brief ctx={null} model={model} setModel={setModel} />
        ) : locked ? (
          <Locked
            title={["Brief", "Interview", "Requirements", "Conflicts", "Approve baseline", "SDLC ranking"][stage]}
            why={LOCK[stage]}
            href={`#/p/${p.id}/${p.stage}`}
          />
        ) : (
          ctx && <View ctx={ctx} model={model} setModel={setModel} />
        )}
      </section>
      <Drawer p={p} stage={stage} sel={sel} />
      <Toaster />
    </div>
  );
}
