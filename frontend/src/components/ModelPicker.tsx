// Model picker in the composer: fallback chain with a status dot (ok / rate-limited / offline) from /api/models.
// A rate-limited model shows a live "retry in Ns" countdown; the list is refreshed every 15 s and when a timer ends.
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Menu } from "./ui";

type M = { id: string; status: string; retry_in: number };
const role = (id: string, i: number) =>
  i === 0 ? "primary" : id === "mock" ? "fixtures" : id.startsWith("ollama/") ? "local" : `fallback ${i}`;
const dot = (s: string) => `sdot ${s === "rate-limited" ? "rl" : s === "offline" ? "off" : ""}`;

export default function ModelPicker({ model, setModel }: { model: string; setModel: (m: string) => void }) {
  const [list, setList] = useState<M[]>([]);
  const [now, setNow] = useState(0); // seconds since the list was fetched
  const load = useCallback(
    () =>
      api<M[]>("/models").then(
        (l) => {
          setList(l);
          setNow(0);
        },
        () => {},
      ),
    [],
  );
  useEffect(() => {
    load();
    const t = setInterval(() => setNow((n) => n + 1), 1000);
    const r = setInterval(load, 15000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [load]);
  const left = (m?: M) => Math.max(0, (m?.retry_in ?? 0) - now);
  const cur = list.find((m) => m.id === model);
  const limited = list.some((m) => m.status === "rate-limited" && m.retry_in > 0 && left(m) === 0);
  useEffect(() => {
    if (limited) load();
  }, [limited, load]);
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
            {left(cur) > 0 && <small> · retry in {left(cur)}s</small>}
          </>
        }
      >
        {list.map((m, i) => (
          <button type="button" key={m.id} onClick={() => setModel(m.id)} aria-pressed={m.id === model}>
            <span className={dot(m.status)} />
            {m.id}
            <small>{m.status === "ok" ? role(m.id, i) : left(m) > 0 ? `${m.status} · ${left(m)}s` : m.status}</small>
          </button>
        ))}
        <hr />
        <button type="button" disabled style={{ fontSize: 12, color: "var(--mut)" }}>
          On 429 the next model is tried until the timer ends. The model used is logged per call.
        </button>
      </Menu>
    </div>
  );
}
