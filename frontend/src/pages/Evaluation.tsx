// Evaluation: metric tiles, retrieval R@1 / R@3 bars and the case-study table from tests/eval.py (data/eval.json).
import { useEffect, useState } from "react";
import { api } from "../api";
import { Chip, Footer } from "../components/ui";

type Eval = {
  generated?: string;
  metrics?: { name: string; value: string; note: string }[];
  retrieval?: { method: string; r1: number; r3: number }[];
  cases?: { name: string; area: string; gold_conflicts: number; expected: string; joules: string; manual: string }[];
};

export default function Evaluation() {
  const [e, setE] = useState<Eval | null>(null);
  useEffect(() => {
    api<Eval>("/eval").then(setE, () => setE({}));
  }, []);
  const m = e?.metrics ?? [];
  return (
    <div className="page">
      <div>
        <p className="lbl">Evaluation</p>
        <h1 className="display">How well it works</h1>
        <p className="muted" style={{ marginTop: 10, maxWidth: "62ch" }}>
          Batch results from tests/eval.py over 5 seeded case studies. Judge model: gemini-3.8-flash, a different family
          from the generator.
          {e?.generated && ` Last run ${e.generated}.`}
        </p>
      </div>
      {e && !m.length ? (
        <div className="empty">
          <h3>No evaluation run yet</h3>
          <p className="muted">
            Run <code>uv run python tests/eval.py</code>; results land in data/eval.json and show here.
          </p>
        </div>
      ) : (
        <>
          <div className="tiles">
            {m.slice(0, 3).map((x, i) => (
              <div key={x.name} className="card tile rise" style={{ "--n": i } as React.CSSProperties}>
                <span className="lbl">{x.name}</span>
                <b>{x.value}</b>
                <span className="muted" style={{ fontSize: 12 }}>
                  {x.note}
                </span>
              </div>
            ))}
          </div>
          <div className="evg" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
            <div className="card rise" style={{ display: "grid", gap: 14 }}>
              <div className="meta">
                <span>Retrieval, gold questions</span>
                <span className="mono">R@1 · R@3</span>
              </div>
              {e?.retrieval?.map((x, i, all) => (
                <div key={x.method} style={{ display: "grid", gap: 6 }}>
                  <div className="meta">
                    <span style={{ color: "var(--ink)" }}>{x.method}</span>
                    <span className="mono">
                      {x.r1.toFixed(2)} · {x.r3.toFixed(2)}
                    </span>
                  </div>
                  <div className="bar">
                    <i
                      style={{
                        width: `${x.r1 * 100}%`,
                        background: i === all.length - 1 ? "var(--acc)" : "var(--mut)",
                      }}
                    />
                  </div>
                  <div className="bar" style={{ height: 5 }}>
                    <i
                      style={{
                        width: `${x.r3 * 100}%`,
                        opacity: 0.5,
                        background: i === all.length - 1 ? "var(--acc)" : "var(--mut)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {m.slice(3).map((x) => (
                <div key={x.name} className="card tile rise">
                  <span className="lbl">{x.name}</span>
                  <b style={{ fontSize: 24 }}>{x.value}</b>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {x.note}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="tbl rise">
            <table>
              <thead>
                <tr>
                  <th>Case study</th>
                  <th>Area</th>
                  <th>Gold conflicts</th>
                  <th>Expected</th>
                  <th>Joules</th>
                  <th>Manual baseline</th>
                </tr>
              </thead>
              <tbody>
                {e?.cases?.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>
                      <Chip t={c.area} />
                    </td>
                    <td className="mono">{c.gold_conflicts}</td>
                    <td>{c.expected}</td>
                    <td style={{ color: `var(${c.expected === c.joules ? "--hi" : "--lo"})` }}>{c.joules}</td>
                    <td className="mono">{c.manual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Footer />
    </div>
  );
}
