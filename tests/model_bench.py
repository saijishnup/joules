"""Quick model bench for the agent chain and the judge: one Interviewer call, one Analyst draft, 6 judge checks each.

Run from joules/:  .tools/bin/uv.exe run python tests/model_bench.py model1 model2 ...   (omniroute must be running)
Prints a table: valid JSON + schema per agent task, judge accuracy, seconds. Calls go straight to the model, no fallback.
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from pydantic import BaseModel, ValidationError

import agents
import llm

BRIEF = (
    "We are building a 40 MW GPU campus near Hyderabad for enterprise tenants. Power comes from the DISCOM plus a "
    "solar PPA. We must file BRSR Core, follow CERT-In incident rules and keep PUE low. Tenants may process personal data."
)
ANSWERS = (
    "Q1 Who runs workloads? -> Several enterprise tenants\nQ2 Peak power? -> Open-access renewable PPA\n"
    "Q3 Cooling? -> Direct-to-chip liquid cooling\nQ4 Personal data? -> Possibly, tenants decide"
)
EVIDENCE = (
    "E1 | CERT-In Directions › Direction (ii) › p. 2 | Report incidents to CERT-In within 6 hours of noticing them.\n"
    "E2 | EU DelReg 2024/1364 › Annex I › p. 9 | Operators report power usage effectiveness every year.\n"
    "E3 | GHG Protocol Scope 2 › Ch. 4 › p. 25 | Companies report Scope 2 with location- and market-based methods.\n"
    "E4 | DPDP Act 2023 › Section 8 › p. 7 | A Data Fiduciary shall protect personal data with reasonable safeguards."
)
# (requirement, evidence, supported?) — 3 true, 3 false
JUDGE_CASES = [
    (
        "The platform shall report cyber incidents to CERT-In within 6 hours.",
        "Service providers shall report incidents to CERT-In within 6 hours of noticing such incidents.",
        True,
    ),
    (
        "The facility shall report annual PUE.",
        "Data centre operators shall report power usage effectiveness and energy use each year.",
        True,
    ),
    (
        "The system shall report Scope 2 emissions with both methods.",
        "Companies shall report scope 2 emissions using both the location-based and the market-based method.",
        True,
    ),
    (
        "The scheduler shall shift GPU load within 15 minutes of a grid signal.",
        "Access control policies shall be reviewed and updated at least annually.",
        False,
    ),
    (
        "Tenant prompts shall be masked before reaching third-party models.",
        "The utility shall replace conventional meters with prepaid smart meters by 2025.",
        False,
    ),
    (
        "The campus shall keep water use below 1.2 litres per kWh.",
        "Organisations shall publish a sustainability report with assurance on core KPIs.",
        False,
    ),
]
JUDGE = 'Does the evidence support the requirement (same topic and a compatible rule)? Reply JSON {"supported": true|false}.'


class Verdict(BaseModel):
    supported: bool


async def timed(model: str, system: str, user: str, schema: type[BaseModel]):
    t = time.monotonic()
    try:
        text, _, _ = await llm._call(model, [{"role": "system", "content": system}, {"role": "user", "content": user}])
        return schema.model_validate_json(text), round(time.monotonic() - t, 1), ""
    except ValidationError as e:
        return None, round(time.monotonic() - t, 1), f"schema: {str(e).splitlines()[1][:40]}"
    except Exception as e:  # noqa: BLE001 - report any provider error in the table
        return None, round(time.monotonic() - t, 1), f"{type(e).__name__}"


async def bench(model: str) -> str:
    q, tq, eq = await timed(
        model,
        agents.INTERVIEWER,
        "Role: Infrastructure architect. Round 1.\n" + agents.data("brief", BRIEF),
        agents.Questions,
    )
    user = "\n".join([agents.data("brief", BRIEF), agents.data("answers", ANSWERS), agents.data("evidence", EVIDENCE)])
    d, td, ed = await timed(model, agents.ANALYST, user, agents.Draft)
    cited = sum(1 for r in d.requirements for e in r.evidence if e in {"E1", "E2", "E3", "E4"}) if d else 0
    right, tj = 0, 0.0
    for req, ev, gold in JUDGE_CASES:
        v, t, _ = await timed(model, JUDGE, agents.data("requirement", req) + agents.data("evidence", ev), Verdict)
        right, tj = right + (v is not None and v.supported == gold), tj + t
    qs = f"{len(q.questions)} q, {tq}s" if q else f"fail ({eq})"
    ds = f"{len(d.requirements)} reqs, {cited} cites, {td}s" if d else f"fail ({ed})"
    return f"| {model} | {qs} | {ds} | {right}/6, {tj / 6:.1f}s avg |"


async def main() -> None:
    print("| Model | Interviewer | Analyst draft | Judge |\n|---|---|---|---|")
    for m in sys.argv[1:]:
        print(await bench(m), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
