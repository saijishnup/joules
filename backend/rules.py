"""Deterministic rules, no LLM: mask PII, validate requirements, confidence, conflict candidates, SDLC rank."""

import re
from itertools import combinations

# ---------- 1. Mask personal data before any LLM call (FR-04) ----------
# Order matters: longer shapes first (GSTIN contains a PAN, a card number contains 12 digits).
MASKS = [
    ("KEY", r"\b(?:sk-|gsk_|ghp_|xox[bp]-|AIza)[\w-]{16,}"),
    ("EMAIL", r"[\w.+-]+@[\w-]+\.[\w.]+"),
    ("GSTIN", r"\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b"),
    ("PAN", r"\b[A-Z]{5}\d{4}[A-Z]\b"),
    ("CARD", r"\b(?:\d[ -]?){13,19}\b"),
    ("AADHAAR", r"\b\d{4}[ -]?\d{4}[ -]?\d{4}\b"),
    ("PHONE", r"(?:\+91[ -]?)?\b[6-9]\d{4}[ -]?\d{5}\b"),
    ("IP", r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
]


def mask(text: str) -> tuple[str, int]:
    """Replace PII with [TAG]s. Returns (masked text, number of items masked)."""
    total = 0
    for tag, pattern in MASKS:
        text, n = re.subn(pattern, f"[{tag}]", text)
        total += n
    return text, total


INJECTION = re.compile(
    r"ignore (all |the )?(previous|above|prior) instructions|disregard .{0,20}instructions|"
    r"you are now|system prompt|</?(data|evidence|brief)>",
    re.IGNORECASE,
)


def injection_hits(text: str) -> list[str]:
    """Prompt-injection patterns; hits are logged to audit, the text still goes in as tagged data."""
    return [m.group() for m in INJECTION.finditer(text)]


# ---------- 2. Validate requirements (PRD §10) ----------
AREAS = {"Energy": "EN", "AI governance": "AI", "DC & cloud": "DC", "ESG": "ESG"}
CATEGORIES = [
    "Business",
    "Stakeholder",
    "Functional",
    "Security",
    "Privacy",
    "Regulatory",
    "Performance",
    "Availability",
    "Usability",
    "Data",
    "Integration",
    "Audit",
    "Operations",
]  # problem statement §9
VAGUE = re.compile(
    r"\b(fast( enough)?|quick(ly)?|easy|user[- ]friendly|as needed|robust|efficient(ly)?|appropriate|"
    r"adequate|sufficient|seamless(ly)?|flexible|optimal|state[- ]of[- ]the[- ]art|if possible|etc)\b",
    re.IGNORECASE,
)
UNIT = re.compile(
    r"\d\s*%|\d[\d.,]*\s*(ms|s|sec|seconds?|min|minutes?|h|hours?|days?|weeks?|months?|years?|[kMG]Wh?|"
    r"tCO2e|kg|t|°C|Hz|[KMGT]B|users?|requests?|times|incidents?|records?)\b|\b(PUE|WUE|CUE)\b.*\d",
    re.IGNORECASE,
)
words = lambda t: set(re.findall(r"[a-z0-9]+", t.lower()))


def assign_ids(reqs: list[dict], taken=()) -> list[dict]:
    """Code makes IDs (FR|NFR-AREA-NNN); whatever the model wrote is ignored."""
    seen = set(taken)
    for r in reqs:
        prefix = f"{'FR' if r.get('type') == 'FR' else 'NFR'}-{AREAS.get(r.get('area'), 'GEN')}-"
        n = 1
        while f"{prefix}{n:03}" in seen:
            n += 1
        r["id"] = f"{prefix}{n:03}"
        seen.add(r["id"])
    return reqs


def check(r: dict, retrieved: dict[str, str], earlier: list[dict]) -> list[str]:
    """Rule findings for one requirement. Drops citations that retrieval never returned."""
    flags, stmt, acc = [], r.get("statement", ""), r.get("acceptance", "")
    if not re.search(r"\bshall\b", stmt, re.IGNORECASE):
        flags.append('Not in "shall" form')
    if m := VAGUE.search(f"{stmt} {acc}"):
        flags.append(f'Vague word: "{m.group()}"')
    if not UNIT.search(acc):
        flags.append("No number + unit in acceptance")
    cited = r.get("evidence", [])
    r["evidence"] = [e for e in cited if e in retrieved]
    if len(r["evidence"]) < len(cited):
        flags.append("Citation not in retrieved evidence, removed")
    if not r["evidence"] and not traced(r):
        flags.append("Missing source")
    for e in earlier:
        a, b = words(stmt), words(e.get("statement", ""))
        if a and len(a & b) / len(a | b) >= 0.8:
            flags.append(f"Duplicate of {e['id']}")
            break
    return flags


def traced(r: dict) -> bool:
    return r.get("source", "").lower().startswith(("brief", "answer"))


def confidence(r: dict, retrieved: dict[str, str]) -> int:
    """0-100 from code (PRD §10): evidence 40, measurable 20, no findings 15, traced 15, LLM self-rating 10."""
    tiers = {retrieved[e] for e in r.get("evidence", []) if e in retrieved}
    ev = 40 if "picked" in tiers else 25 if tiers else 20 if traced(r) else 0
    rating = min(max(float(r.get("self_rating", 0.5)), 0), 1)
    return round(
        ev + 20 * bool(UNIT.search(r.get("acceptance", ""))) + 15 * (not r.get("flags")) + 15 * traced(r) + 10 * rating
    )


def band(score: int) -> str:
    return "High" if score >= 75 else "Medium" if score >= 50 else "Low"


def validate(reqs: list[dict], retrieved: dict[str, str], taken=()) -> list[dict]:
    """IDs, findings and confidence for each requirement. retrieved = {leaf_id: 'picked' | 'stage1'}."""
    assign_ids(reqs, taken)
    for i, r in enumerate(reqs):
        r["flags"] = check(r, retrieved, reqs[:i])
        r["confidence"] = confidence(r, retrieved)
    return reqs


def coverage(reqs: list[dict], areas: list[str]) -> list[str]:
    """Open issues for gaps: an area with no requirement, or no security requirement at all."""
    have = {r.get("area") for r in reqs}
    issues = [f"No requirement covers {a}." for a in areas if a not in have]
    if not any("Security" in r.get("categories", []) for r in reqs):
        issues.append("No security requirement; add one or record why none is needed.")
    return issues


# ---------- 3. Conflicts: code proposes pairs, the Analyst confirms (PRD §10) ----------
TENSIONS = [  # (category in one requirement, category in another, conflict type)
    ("Performance", "Availability", "Efficiency vs resilience"),
    ("Audit", "Privacy", "Retention vs privacy"),
    ("Data", "Privacy", "Retention vs privacy"),
    ("Audit", "Security", "Transparency vs security"),
    ("Business", "Availability", "Cost vs redundancy"),
    ("Performance", "Security", "Speed vs control"),
    ("Integration", "Security", "Openness vs security"),
]


def conflict_candidates(reqs: list[dict], limit: int = 8) -> list[dict]:
    """Pairs whose categories sit on opposite sides of a tension: cross-area pairs first, then table order.
    These are hints for the Analyst, who may also add pairs code cannot see."""
    out = []
    for a, b in combinations(reqs, 2):
        ca, cb = set(a.get("categories", [])), set(b.get("categories", []))
        for i, (x, y, kind) in enumerate(TENSIONS):
            if (x in ca and y in cb) or (y in ca and x in cb):
                out.append(((a.get("area") == b.get("area"), i), {"a": a["id"], "b": b["id"], "type": kind}))
                break
    return [c for _, c in sorted(out, key=lambda t: t[0])][:limit]  # small Analyst prompt (NFR-02)


TENSION_TYPES = sorted({t for _, _, t in TENSIONS})


def keep_conflicts(notes: list[dict], rids: set[str], limit: int = 5) -> list[dict]:
    """Keep confirmed conflicts whose two IDs exist and differ, one per pair, type from the table (else "Other")."""
    out, seen = [], set()
    for n in notes:
        pair = frozenset((n.get("a"), n.get("b")))
        if n.get("confirmed") and n["a"] in rids and n["b"] in rids and n["a"] != n["b"] and pair not in seen:
            seen.add(pair)
            out.append(n | {"type": n.get("type") if n.get("type") in TENSION_TYPES else "Other"})
    return out[:limit]  # a gate with more than 5 open conflicts is noise, not review


# ---------- 4. SDLC rank: same factor levels give the same ranking (NFR-01) ----------
FACTORS = [
    "Requirement stability",
    "Regulatory criticality",
    "Security risk",
    "Project complexity",
    "System size",
    "Legacy-system dependence",
    "Expected change frequency",
    "Need for continuous delivery",
    "Stakeholder availability",
    "Testing and documentation formality",
    "Budget and schedule pressure",
    "Need for formal verification",
    "Failure consequence",
]
LEVEL = {"Low": 0, "Medium": 1, "High": 2}
S, R, SEC, CX, SZ, _LEGACY, CH, CD, SH, FM, BU, FV, FC = FACTORS  # short names for the weight table
# (base, weights). Dict order is the fixed tie-break order.
MODELS = {
    # NASA SE Handbook + NIST 800-64: sequential phases suit stable, document-heavy work.
    "Waterfall": (50, {S: 10, FM: 5, R: 3, CH: -10, CD: -6, CX: -3, SZ: -2}),
    # NASA SE Handbook (V diagram): each build phase has a matching verification phase.
    "V-Model": (46, {FV: 8, FM: 5, R: 5, FC: 3, S: 5, CH: -8, CD: -5}),
    # NASA SE Handbook risk management: risk-driven loops for complex, high-consequence systems.
    "Spiral": (52, {FC: 5, CX: 7, SZ: 3, SH: 3, S: -6, CD: -3}),
    # Scrum Guide: short sprints absorb change with engaged stakeholders.
    "Agile": (50, {CH: 10, CD: 6, SH: 5, FM: -6, R: -5, S: -3}),
    # NIST SSDF 800-218: security practices built into continuous delivery.
    "DevSecOps": (44, {CD: 9, SEC: 8, CH: 4, FM: -2}),
    # Scrum Guide + NIST 800-64: fast prototypes only for low-risk, unregulated work.
    "RAD": (52, {CH: 5, BU: 4, CX: -6, FC: -6, R: -6}),
    # NASA SE Handbook + Scrum Guide: sprints inside V-Model verification gates for regulated, changing work.
    "Agile-V hybrid": (46, {R: 6, CH: 6, FV: 4, SEC: 3, FM: 3, CD: 2, S: -2}),
}
WHY = {  # (why it fits, why not)
    "Waterfall": ("stable requirements and extensive approvals", "testing comes late, after design is locked"),
    "V-Model": ("every build phase has a matching test phase", "rigid once a phase closes; late changes are expensive"),
    "Spiral": ("risk-driven loops for high uncertainty", "heavy risk analysis each loop when requirements are clear"),
    "Agile": ("short iterations absorb changing requirements", "light documentation clashes with formal audit"),
    "DevSecOps": ("continuous secure deployment with automated checks", "its value is continuous delivery"),
    "RAD": ("rapid prototyping for small, low-risk systems", "too little rigour for high-risk or regulated systems"),
    "Agile-V hybrid": (
        "high regulation with evolving requirements: sprints plus V-Model gates",
        "two processes to run; pays off only when requirements keep changing",
    ),
}


def rank(levels: dict[str, str]) -> list[dict]:
    """score = clamp(5, 97, base + sum(weight x level)); Low 0, Medium 1, High 2; missing factor = Medium."""
    order = list(MODELS)
    scores = {
        m: max(5, min(97, base + sum(w * LEVEL.get(levels.get(f), 1) for f, w in ws.items())))
        for m, (base, ws) in MODELS.items()
    }
    ranked = sorted(scores, key=lambda m: (-scores[m], order.index(m)))
    counts = list(scores.values())
    return [
        {"model": m, "score": scores[m], "why": WHY[m][0], "why_not": WHY[m][1], "tie": counts.count(scores[m]) > 1}
        for m in ranked
    ]


def factor_confidence(factors: dict[str, dict], conf: dict[str, int]) -> tuple[dict[str, int], int]:
    """Factor confidence = mean of cited requirements; overall = mean weighted by number of citations."""
    per, total, n = {}, 0, 0
    for name, f in factors.items():
        vals = [conf[c] for c in f.get("cites", []) if c in conf]
        per[name] = round(sum(vals) / len(vals)) if vals else 0
        total, n = total + sum(vals), n + len(vals)
    return per, round(total / n) if n else 0


# PRD worked example (GPU campus): Low on legacy, Medium on 5 factors, High on the rest.
GPU_CAMPUS = dict.fromkeys(FACTORS, "High") | {_LEGACY: "Low"} | dict.fromkeys([S, CD, SH, BU, FV], "Medium")

if __name__ == "__main__":  # self-check: uv run python backend/rules.py
    got = [(r["model"], r["score"]) for r in rank(GPU_CAMPUS)]
    assert got == [
        ("Agile-V hybrid", 86),
        ("Spiral", 76),
        ("DevSecOps", 73),
        ("V-Model", 64),
        ("Agile", 56),
        ("Waterfall", 40),
        ("RAD", 30),
    ], got
    assert rank(GPU_CAMPUS) == rank(dict(GPU_CAMPUS))  # determinism
    print("ok", got[0])
