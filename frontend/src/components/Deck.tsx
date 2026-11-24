// Card deck used by Interview, Requirements and Conflicts: counter, progress dots, ← → buttons and keys.
// Cards drop in from above; the old card collapses downward into the deck. Only the card on top animates
// (AnimatePresence keyed by card id); the page around it stays still (NFR-09).
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect } from "react";

const spring = { type: "spring", stiffness: 380, damping: 22 } as const;

type Props = {
  n: number;
  i: number;
  setI: (i: number) => void;
  marks: [string, string][];
  lockNext?: boolean;
  cardKey: string;
  children: ReactNode;
};

export default function Deck({ n, i, setI, marks, lockNext, cardKey, children }: Props) {
  const go = (d: number) => {
    if (d > 0 && (lockNext || i >= n - 1)) return;
    setI(Math.max(0, Math.min(n - 1, i + d)));
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  return (
    <div style={{ display: "grid", gap: 12, width: "100%" }}>
      <div className="deckbar">
        <span className="kv">
          {i + 1} of {n}
        </span>
        <div className="dots">
          {marks.map(([k, m], j) => (
            <i key={k} className={j === i ? "on" : m} />
          ))}
        </div>
        <span style={{ marginLeft: "auto" }} />
        <button type="button" className="ib" aria-label="Previous" disabled={i === 0} onClick={() => go(-1)}>
          ←
        </button>
        <button type="button" className="ib" aria-label="Next" disabled={i >= n - 1 || lockNext} onClick={() => go(1)}>
          →
        </button>
      </div>
      <div className="deck" data-tour="deck">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={cardKey}
            transition={spring}
            initial={{ opacity: 0, y: -28 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: 24, scaleY: 0.85 }}
            style={{ transformOrigin: "bottom" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
