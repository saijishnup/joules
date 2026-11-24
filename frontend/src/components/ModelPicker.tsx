// Model picker in the composer: fallback chain with a status dot (ok / rate-limited / offline) from /api/models.
import { useEffect, useState } from "react";
import { api } from "../api";
import { Menu } from "./ui";

type M = { id: string; status: string };
const role = (id: string, i: number) =>
  i === 0 ? "primary" : id === "mock" ? "fixtures" : id.startsWith("ollama/") ? "local" : `fallback ${i}`;
const dot = (s: string) => `sdot ${s === "rate-limited" ? "rl" : s === "offline" ? "off" : ""}`;

export default function ModelPicker({ model, setModel }: { model: string; setModel: (m: string) => void }) {
  const [list, setList] = useState<M[]>([]);
  useEffect(() => {
    api<M[]>("/models").then(setList, () => {});
  }, []);
  const cur = list.find((m) => m.id === model);
  return (
    <div data-tour="model">
      <Menu
        up
        label="Model"
        className=""
        button={
          <>
            <span className={dot(cur?.status || "ok")} />
            {model}
          </>
        }
      >
        {list.map((m, i) => (
          <button type="button" key={m.id} onClick={() => setModel(m.id)} aria-pressed={m.id === model}>
            <span className={dot(m.status)} />
            {m.id}
            <small>{m.status === "ok" ? role(m.id, i) : m.status}</small>
          </button>
        ))}
        <hr />
        <button type="button" disabled style={{ fontSize: 12, color: "var(--mut)" }}>
          On 429 the next model is tried. The model used is logged per call.
        </button>
      </Menu>
    </div>
  );
}
