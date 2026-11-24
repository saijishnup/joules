// Fetch wrapper, shared types and the SSE hook. One file so the data contract is in one place.
import { useCallback, useEffect, useState } from "react";

export type Level = "Low" | "Medium" | "High";
export type Question = { id: string; topic: string; text: string; why: string; options: string[]; recommended: number };
export type Given = { option: number; answer: string; note: string };
export type Req = {
  id: string;
  type: "FR" | "NFR";
  area: string;
  categories: string[];
  priority: string;
  statement: string;
  acceptance: string;
  user_story: string;
  source: string;
  source_quote: string;
  evidence: string[];
  risk: Level;
  confidence: number;
  flags: string[];
  status: string;
  version: number;
  stakeholder: string;
};
export type Leaf = {
  id: string;
  label: string;
  ref: string;
  snippet: string;
  title: string;
  link: string;
  public: boolean;
  tier: string;
};
export type Conflict = {
  id: number;
  a_rid: string;
  b_rid: string;
  type: string;
  explanation: string;
  fix: string;
  resolution: string | null;
  note: string | null;
};
export type Approval = {
  id: number;
  gate: number;
  version: number;
  name: string;
  role: string;
  comment: string;
  at: string;
};
export type Rank = { model: string; score: number; why: string; why_not: string; tie: boolean };
export type Factor = { level: Level; cites: string[]; why: string; confidence?: number };
export type Phase = {
  name: string;
  activities: string[];
  roles: string[];
  deliverables: string[];
  checkpoints: string[];
  entry: string;
  exit: string;
};
export type Audit = {
  id: number;
  at: string;
  kind: string;
  agent: string | null;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  ms: number;
  rules: Record<string, unknown> | null;
  response: string | null;
};
export type Project = {
  id: number;
  name: string;
  role: string;
  area: string;
  stage: number;
  brief_masked: string;
  updated_at: string;
  created_at: string;
  uploads: { name: string; words: number; cut: boolean; masked: number }[];
  answers: { round?: number; questions?: Question[]; given?: Record<string, Given> };
  factors: Record<string, Factor>;
  ranking: Rank[];
  workflow: { summary?: string; model?: string; phases?: Phase[] };
  artefacts: {
    risks?: { text: string; level: Level }[];
    assumptions?: string[];
    open_issues?: string[];
    evidence?: Record<string, Leaf>;
    masked?: number;
    factor_confidence?: number;
  };
  baseline_version: number;
  requirements: Req[];
  conflicts: Conflict[];
  approvals: Approval[];
  audit: Audit[];
  gates: Record<string, boolean>;
  running: boolean;
};
export type ProjectRow = Pick<Project, "id" | "name" | "role" | "area" | "stage" | "updated_at">;

export const STAGES = ["Brief", "Interview", "Requirements", "Conflicts", "Approve", "SDLC", "Export"];
export const AREAS = ["Energy", "AI governance", "DC & cloud", "ESG"];
export const ROLES = [
  "Infrastructure architect",
  "Product owner",
  "Compliance officer",
  "Security lead",
  "Sustainability lead",
  "Operations manager",
];
export const APPROVERS = ["Project manager", "Architect", "Security lead", "Compliance officer"];
export const words = (s: string) => (s.trim().match(/\S+/g) || []).length;
export const band = (c: number): [string, string] =>
  c >= 75 ? ["High", "--hi"] : c >= 50 ? ["Medium", "--med"] : ["Low", "--lo"];
export const ist = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** JSON fetch to /api; throws Error(detail) so forms can show the server's message inline. */
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const raw = body instanceof Blob;
  const r = await fetch(`/api${path}`, {
    method,
    headers: body && !raw ? { "Content-Type": "application/json" } : undefined,
    body: raw ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    const d = data?.detail;
    throw new Error(
      Array.isArray(d)
        ? d.map((x: { msg: string }) => x.msg.replace("Value error, ", "")).join("; ")
        : d || r.statusText,
    );
  }
  return data as T;
}

/** Full project state plus live agent status. Any SSE event triggers a reload; React re-renders only what changed. */
export function useProject(id: number | null) {
  const [p, setP] = useState<Project | null>(null);
  const [agent, setAgent] = useState<{ agent: string | null; state: string }>({ agent: null, state: "idle" });
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (id)
      setP(
        await api<Project>(`/projects/${id}`).catch((e) => {
          setError(e.message);
          return null;
        }),
      );
  }, [id]);
  useEffect(() => {
    if (!id) return setP(null);
    reload();
    const es = new EventSource(`/api/projects/${id}/events`);
    const on = (e: MessageEvent) => {
      if (e.data === undefined) return; // the browser's own "error" when the stream drops; EventSource reconnects
      if (e.type === "agent_state") setAgent(JSON.parse(e.data));
      if (e.type === "error") setError(JSON.parse(e.data).message);
      else setError("");
      reload();
    };
    for (const t of ["stage", "agent_state", "question", "requirement", "conflict", "ranking", "error"])
      es.addEventListener(t, on);
    return () => es.close();
  }, [id, reload]);
  return { p, reload, agent, error, setError };
}
