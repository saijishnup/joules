// Projects: compact header (title, search, New project), cards with area chip, stage progress and IST time.
import { Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ist, type ProjectRow, STAGES } from "../api";
import { Avatar, Chip, Footer } from "../components/ui";

export default function Projects() {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<ProjectRow[]>("/projects").then(setRows, () => setRows([]));
  }, []);

  async function remove(p: ProjectRow) {
    if (!confirm(`Delete "${p.name}" with all its requirements, approvals and audit rows? This cannot be undone.`))
      return;
    await api(`/projects/${p.id}`, "DELETE");
    setRows((r) => r?.filter((x) => x.id !== p.id) ?? null);
  }

  async function reset(p: ProjectRow) {
    if (!confirm(`Reset "${p.name}"? This clears everything except the brief and uploads.`)) return;
    const s = await api<ProjectRow>(`/projects/${p.id}/reset`, "POST");
    setRows((r) => r?.map((x) => (x.id === p.id ? { ...x, stage: s.stage, updated_at: s.updated_at } : x)) ?? null);
  }

  const shown = rows?.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) ?? [];
  return (
    <div className="page compact">
      <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <p className="lbl">Workspace</p>
          <h1 className="display">Projects</h1>
        </div>
        <label className="comp" style={{ width: 260 }}>
          <Search />
          <input
            placeholder="Search projects"
            aria-label="Search projects"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <a className="b pri" href="#/new">
          <Plus />
          New project
        </a>
      </div>
      {rows === null ? (
        <div className="pgrid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card pcard skel" style={{ height: 132 }} />
          ))}
        </div>
      ) : shown.length ? (
        <div className="pgrid">
          {shown.map((p, i) => (
            <a
              key={p.id}
              className="card pcard rise"
              style={{ "--n": i } as React.CSSProperties}
              href={`#/p/${p.id}/${p.stage}`}
            >
              <div className="meta" style={{ gap: 8 }}>
                <Chip t={p.area} />
                <span className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {ist(p.updated_at)}
                </span>
              </div>
              <h3>{p.name}</h3>
              <p className="muted" style={{ fontSize: 12 }}>
                {p.role} · stage {p.stage + 1} of 7, {STAGES[p.stage]}
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className="prog" style={{ flex: 1 }}>
                  <i style={{ width: `${((p.stage + 1) / 7) * 100}%` }} />
                </div>
                <button
                  type="button"
                  className="ib"
                  style={{ height: 26, minWidth: 26, border: 0 }}
                  aria-label={`Reset ${p.name}`}
                  title="Reset to the brief"
                  onClick={(e) => {
                    e.preventDefault();
                    reset(p).catch((err) => alert(err.message));
                  }}
                >
                  <RotateCcw />
                </button>
                <button
                  type="button"
                  className="ib"
                  style={{ height: 26, minWidth: 26, border: 0 }}
                  aria-label={`Delete ${p.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    remove(p);
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Avatar name="Interviewer" />
          <h3>{q ? `No project matches "${q}"` : "No projects yet"}</h3>
          <p className="muted">Start a project with a short brief. The Interviewer asks 3 to 4 questions per round.</p>
          <a className="b pri" href="#/new">
            <Plus />
            New project
          </a>
        </div>
      )}
      <Footer />
    </div>
  );
}
