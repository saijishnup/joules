// Brief: project name, role, area, brief text with live word counter and mask preview, up to 2 uploads, then start.
import { ArrowRight, Paperclip, Shield, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AREAS, api, type Project, ROLES, words } from "../api";
import ModelPicker from "../components/ModelPicker";
import { Avatar } from "../components/ui";
import type { Ctx } from "../pages/Workspace";

// Same shapes as rules.mask on the server, only to preview the count; the server masks for real.
const MASK = [
  /[\w.+-]+@[\w-]+\.[\w.]+/g,
  /(\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g,
  /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/g,
  /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
];
type Props = { ctx: Ctx | null; model: string; setModel: (m: string) => void };

export default function Brief({ ctx, model, setModel }: Props) {
  const p = ctx?.p;
  const [f, setF] = useState({
    name: p?.name ?? "",
    role: p?.role ?? ROLES[0],
    area: p?.area ?? AREAS[2],
    brief: p?.brief_masked ?? "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const n = words(f.brief);
  const masks = MASK.reduce((s, r) => s + (f.brief.match(r) || []).length, 0);
  const started = !!p && p.stage > 0;
  const thinking = busy || ctx?.agent.state === "thinking" || p?.running;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !f.brief.trim()) return setErr("Give the project a name and write a brief.");
    if (n > 1500) return setErr("The brief is over 1,500 words.");
    setBusy(true);
    setErr("");
    try {
      const proj = p ?? (await api<Project>("/projects", "POST", { name: f.name, role: f.role, area: f.area }));
      for (const file of files)
        await api(`/projects/${proj.id}/upload?name=${encodeURIComponent(file.name)}`, "POST", file);
      await api(`/projects/${proj.id}/run`, "POST", { model, brief: f.brief });
      location.hash = `#/p/${proj.id}/0`;
      await ctx?.reload();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="who rise">
        <div>
          <h2>Brief</h2>
          <p>Describe the system in plain words. Personal data is masked before any model sees it.</p>
        </div>
        <Avatar name="Interviewer" state={thinking ? "thinking" : "idle"} />
      </div>
      <form
        className="card rise"
        style={{ "--n": 1, display: "grid", gap: 16 } as React.CSSProperties}
        onSubmit={submit}
      >
        <div className="field">
          <label htmlFor="pn">Project name</label>
          <input className="in" id="pn" maxLength={80} value={f.name} onChange={set("name")} disabled={!!p} />
          <span className="help">Up to 80 characters.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label htmlFor="role">Your role</label>
            <select className="in" id="role" value={f.role} onChange={set("role")} disabled={!!p}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <span className="help">Tailors the interview; stamped on every requirement.</span>
          </div>
          <div className="field">
            <label htmlFor="area">Main area</label>
            <select className="in" id="area" value={f.area} onChange={set("area")} disabled={!!p}>
              {AREAS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <span className="help">Coverage is checked for this area.</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="bt">Brief</label>
          <textarea className="in" id="bt" rows={8} value={f.brief} onChange={set("brief")} readOnly={started} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="help">
              <Shield style={{ display: "inline", verticalAlign: -3 }} />{" "}
              {started
                ? `${p?.artefacts.masked ?? 0} items were masked`
                : `${masks} items will be masked before sending`}
            </span>
            <span className="cnt" style={{ color: n > 1500 ? "var(--lo)" : undefined }}>
              {n} / 1,500 words
            </span>
          </div>
        </div>
        {(files.length > 0 || (p?.uploads.length ?? 0) > 0) && (
          <div className="chips">
            {p?.uploads.map((u) => (
              <span key={u.name} className="kv">
                {u.name} · {u.words} words{u.cut ? " (cut)" : ""} · {u.masked} masked
              </span>
            ))}
            {files.map((x) => (
              <button type="button" key={x.name} className="ib" onClick={() => setFiles(files.filter((y) => y !== x))}>
                {x.name}
                <X />
              </button>
            ))}
          </div>
        )}
        {err && (
          <span className="err" role="alert">
            {err}
          </span>
        )}
        {!started && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label className="b ghost" style={{ cursor: "pointer" }}>
              <Paperclip />
              Attach file
              <input
                type="file"
                hidden
                accept=".pdf,.txt,.md"
                onChange={(e) => e.target.files?.[0] && files.length < 2 && setFiles([...files, e.target.files[0]])}
              />
            </label>
            <span className="help muted" style={{ fontSize: 12 }}>
              PDF, TXT or MD · 5 MB · 8,000 words · max 2
            </span>
            <span style={{ marginLeft: "auto" }} />
            <ModelPicker model={model} setModel={setModel} />
            <button type="submit" className="b pri" disabled={thinking}>
              {thinking ? "Interviewer is reading…" : "Start interview"} <ArrowRight />
            </button>
          </div>
        )}
      </form>
    </>
  );
}
