// Small shared pieces: wordmark, chips, agent avatars, popover menu, footer, toast, locked note.
import { ArrowRight, Check, Lock } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

const S2 =
  "M11.2 .6C7.4.4 2.2 2.6 2.2 6.3c0 2.7 4.3 3.4 6.1 4.4L.8 19.4l.8.6 9.3-8.4c1-1-.2-2.1-1.7-2.9C7.6 7.8 5.2 7.2 5.2 6.2c0-1.8 3.4-2.8 6-2.9Z";
export const Wordmark = () => (
  <a className="wm" href="#/projects" aria-label="Joules home">
    joule
    <svg viewBox="0 0 12 20" fill="currentColor" aria-hidden="true">
      <path d={S2} />
    </svg>
  </a>
);

const AREA: Record<string, string> = {
  Energy: "--energy",
  "AI governance": "--aigov",
  "DC & cloud": "--dc",
  ESG: "--esg",
};
export const Chip = ({ t, v }: { t: string; v?: string }) => (
  <span className="chip" style={{ "--c": `var(${v || AREA[t] || "--mut"})` } as React.CSSProperties}>
    {t}
  </span>
);

// Avatars: CSS only (PRD §18). Interviewer lava, Analyst liquid dots x5, Planner liquid bars x7.
const AG: Record<string, { shape: string; c: string[]; n?: number }> = {
  Interviewer: { shape: "lava", c: ["#C6F432", "#22C1D6", "#2E8B3A"] },
  Analyst: { shape: "gd", c: ["#FFB020", "#F07A45", "#7A3B00"], n: 5 },
  Planner: { shape: "gb", c: ["#FF4FA3", "#22C1D6", "#6A1B9A"], n: 7 },
};
export function Avatar({ name, state = "idle", big }: { name: string; state?: string; big?: boolean }) {
  const a = AG[name];
  const vars = { "--c1": a.c[0], "--c2": a.c[1], "--c3": a.c[2] } as React.CSSProperties;
  return (
    <div
      className={`av ${state} ${big ? "big" : ""}`}
      role="img"
      aria-label={`${name} is ${state}`}
      title={`${name}, ${state}`}
    >
      {a.shape === "lava" ? (
        <div className="a2 lava" style={vars}>
          <b />
          <b />
          <b />
        </div>
      ) : (
        <div className={`a2 goo ${a.shape}`} style={vars}>
          {Array.from({ length: a.n || 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed set of avatar dots
            <i key={i} style={{ "--dl": `${-i * 0.16}s` } as React.CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Button + popover; closes on outside click or Escape. */
export function Menu({
  button,
  children,
  up,
  className = "ib",
  label,
}: {
  button: ReactNode;
  children: ReactNode;
  up?: boolean;
  className?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) =>
      (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="pick" ref={ref}>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {button}
      </button>
      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: items are buttons; Escape closes
        <div className={`menu open ${up ? "" : "down"}`} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export const Footer = () => (
  <div className="footer">
    <span>Joules, AGPL-3.0</span>
    <a href="#/terms">Terms</a>
    <a href="#/privacy">Privacy</a>
    <span style={{ marginLeft: "auto" }}>Not legal advice. Outputs need human approval.</span>
  </div>
);

let showToast: (t: string) => void = () => {};
export const toast = (t: string) => showToast(t);
export function Toaster() {
  const [t, setT] = useState("");
  useEffect(() => {
    showToast = (x) => {
      setT(x);
      setTimeout(() => setT(""), 2600);
    };
  }, []);
  return t ? (
    <div className="toast" role="status">
      <Check />
      {t}
    </div>
  ) : null;
}

export const Locked = ({ title, why, href }: { title: string; why: string; href: string }) => (
  <>
    <div className="who rise">
      <div>
        <h2>{title}</h2>
        <p>This stage opens after the step before it.</p>
      </div>
    </div>
    <div className="empty rise">
      <Lock />
      <h3>Locked</h3>
      <p className="muted">{why}</p>
      <a className="b pri" href={href}>
        Go there <ArrowRight />
      </a>
    </div>
  </>
);
