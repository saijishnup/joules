// About page diagrams: a simple use-case diagram and a sequence diagram, drawn as SVG with the theme tokens.
const ink = { fill: "var(--ink)", fontSize: 12.5 } as const;
const line = { stroke: "var(--line)", strokeWidth: 1.2, fill: "none" } as const;
const link = { stroke: "var(--mut)", strokeWidth: 1.6, fill: "none" } as const; // actor to use case, clearly visible

const Actor = ({ x, y, name }: { x: number; y: number; name: string }) => (
  <g stroke="var(--mut)" strokeWidth={1.5} fill="none">
    <circle cx={x} cy={y} r={9} />
    <path d={`M${x} ${y + 9}v22M${x - 14} ${y + 18}h28M${x} ${y + 31}l-12 16M${x} ${y + 31}l12 16`} />
    <text x={x} y={y + 66} textAnchor="middle" style={ink} stroke="none">
      {name}
    </text>
  </g>
);

const CASES = [
  "Write a brief",
  "Answer interview cards",
  "Review cited requirements",
  "Resolve conflicts",
  "Approve gate 1: requirements",
  "Approve gate 2: SDLC choice",
  "Export one-page report",
];

export function UseCase() {
  const y = (i: number) => 26 + i * 46;
  return (
    <svg viewBox="0 0 760 340" role="img" aria-label="Use-case diagram: stakeholder and approver">
      <title>Use cases</title>
      <rect x={150} y={4} width={460} height={332} rx={16} {...line} strokeDasharray="4 4" />
      {CASES.map((c, i) => {
        const left = i < 4;
        return (
          <g key={c}>
            <path d={left ? `M66 150L250 ${y(i)}` : `M694 150L510 ${y(i)}`} {...link} />
            <rect x={250} y={y(i) - 16} width={260} height={32} rx={16} fill="var(--surf2)" stroke="var(--acct)" />
            <text x={380} y={y(i) + 4} textAnchor="middle" style={ink}>
              {c}
            </text>
          </g>
        );
      })}
      <Actor x={50} y={110} name="Stakeholder" />
      <Actor x={710} y={110} name="Approver" />
    </svg>
  );
}

const LANES = ["Stakeholder", "App (FastAPI)", "Agents + LLM", "Rules (code)", "SQLite"];
// [from lane, to lane, message]; the last field marks the human steps
const MSGS: [number, number, string][] = [
  [0, 1, "brief + role"],
  [1, 3, "mask personal data"],
  [1, 2, "retrieve sources, ask questions"],
  [2, 0, "interview cards"],
  [0, 1, "answers"],
  [1, 2, "draft requirements with evidence"],
  [2, 3, "check wording, citations, confidence"],
  [3, 4, "save requirements and conflicts"],
  [0, 1, "resolve conflicts, approve gate 1"],
  [1, 3, "rank 7 SDLC models"],
  [3, 0, "ranking + workflow, approve gate 2"],
];

export function Sequence() {
  const x = (i: number) => 80 + i * 150;
  const y = (i: number) => 86 + i * 32;
  return (
    <svg viewBox="0 0 800 470" role="img" aria-label="Sequence diagram of one Joules run">
      <title>One run, step by step</title>
      <defs>
        <marker
          id="arr"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="11"
          markerHeight="11"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10z" fill="var(--acct)" />
        </marker>
      </defs>
      {LANES.map((l, i) => (
        <g key={l}>
          <rect x={x(i) - 58} y={10} width={116} height={30} rx={10} fill="var(--surf2)" stroke="var(--line)" />
          <text x={x(i)} y={29} textAnchor="middle" style={ink}>
            {l}
          </text>
          <path d={`M${x(i)} 40V455`} {...link} strokeWidth={1} strokeDasharray="4 5" opacity={0.6} />
        </g>
      ))}
      {MSGS.map(([a, b, t], i) => {
        const mid = (x(a) + x(b)) / 2;
        return (
          <g key={t}>
            <path
              d={`M${x(a)} ${y(i)}H${x(b) + (b > a ? -3 : 3)}`}
              stroke="var(--acct)"
              strokeWidth={2}
              strokeDasharray={b < a ? "6 5" : undefined} /* replies go right to left and are dashed */
              markerEnd="url(#arr)"
            />
            <text x={mid} y={y(i) - 7} textAnchor="middle" style={{ ...ink, fontSize: 11.5 }}>
              {i + 1}. {t}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
