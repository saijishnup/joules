"""Write data/evaluation.html from data/eval.json (run after tests/eval.py): method, metrics, retrieval, cases."""

import html
import json
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
e = json.loads((root / "data" / "eval.json").read_text(encoding="utf-8"))
gold = json.loads((root / "tests" / "fixtures" / "cases.json").read_text(encoding="utf-8"))
h = html.escape
metrics = "".join(
    f"<div class=tile><span>{h(m['name'])}</span><b>{h(m['value'])}</b><small>{h(m['note'])}</small></div>"
    for m in e["metrics"]
)
ret = "".join(
    f"<tr><td>{h(r['method'])}</td><td class=n>{r['r1']:.2f}</td><td class=n>{r['r3']:.2f}</td><td><i style='width:{r['r3'] * 100:.0f}%'></i></td></tr>"
    for r in e["retrieval"]
)
cases = "".join(
    f"<tr><td>{h(c['name'])}</td><td>{h(c['area'])}</td><td class=n>{c['requirements']}</td><td class=n>{c['tp']}/{c['gold_conflicts']} (+{c['fp']} extra)</td>"
    f"<td>{h(c['expected'])}</td><td class={'ok' if c['expected'] == c['joules'] else 'bad'}>{h(c['joules'])}</td><td class=n>{c['secs']:.0f} s</td><td class=n>{c['tokens']:,}</td><td>{h(', '.join(m.split('/')[-1] for m in c['models']))}</td></tr>"
    for c in e["cases"]
)
qs = "".join(f"<li>{h(q)} <small>→ {h(', '.join(g))}</small></li>" for q, g in gold["retrieval"])
page = f"""<!doctype html><html lang=en><meta charset=utf-8><title>Joules evaluation</title>
<style>body{{font:15px/1.6 Geist,system-ui,sans-serif;max-width:1000px;margin:40px auto;padding:0 24px;color:#16181A}}
h1{{font-size:40px;letter-spacing:-.03em;margin:0}}h2{{margin-top:36px;font-size:20px;border-left:3px solid #9BC400;padding-left:10px}}
.tiles{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}.tile{{border:1px solid #E5E7EB;border-radius:14px;padding:14px;display:grid;gap:4px}}
.tile b{{font:500 28px ui-monospace,monospace}}.tile span,small{{color:#6B7280;font-size:12px}}table{{width:100%;border-collapse:collapse;font-size:13px}}
th,td{{text-align:left;padding:7px 8px;border-bottom:1px solid #EEF0F2;vertical-align:top}}th{{color:#6B7280;font-weight:500}}.n{{font-family:ui-monospace,monospace}}
td i{{display:block;height:8px;border-radius:4px;background:#9BC400}}.ok{{color:#1F7D71}}.bad{{color:#C2412D}}code{{background:#F3F4F6;padding:2px 6px;border-radius:6px}}
li small{{color:#6B7280}}</style>
<p style="color:#6B7280">Joules · viva notes</p><h1>Evaluation</h1>
<p>Run {h(e["generated"])} with <code>{h(e["model"])}</code> through the real pipeline (retrieval, three agents, rules, gates skipped by a scripted stakeholder who always picks the recommended option). Separate database <code>data/eval.db</code>, full source index (40+ documents, 6,447 sections).</p>
<h2>Metrics</h2><div class=tiles>{metrics}</div>
<h2>How each metric is computed</h2><ul>
<li><b>Citation validity</b>: share of cited leaves that retrieval actually returned. Invented labels are removed by <code>rules.check</code> and counted.</li>
<li><b>Hallucination rate</b>: LLM judge (a different model family when available) reads the requirement and its first cited passage, says supported or not; up to 5 requirements per case.</li>
<li><b>Conflict precision / recall</b>: conflict types Joules confirmed vs the gold tension types per case (hand-labelled).</li>
<li><b>SDLC agreement</b>: top-ranked model vs the expected model (hand-labelled).</li>
<li><b>Human correction</b>: requirements edited or rejected by people in the app database.</li>
<li><b>Time and tokens</b>: from the audit table (brief to ranking).</li>
<li><b>Manual baseline</b>: not measured yet; time one case by hand to fill it in.</li></ul>
<h2>Retrieval, {len(gold["retrieval"])} gold questions</h2>
<p>Questions are phrased the way a stakeholder would ask, without document names. Hit = a top-k leaf comes from a gold document.</p>
<table><tr><th>Method</th><th>R@1</th><th>R@3</th><th></th></tr>{ret}</table>
<h2>Case studies</h2><table><tr><th>Case</th><th>Area</th><th>Reqs</th><th>Gold conflicts found</th><th>Expected</th><th>Joules</th><th>Time</th><th>Tokens</th><th>Models used</th></tr>{cases}</table>
<h2>Limits</h2><ul><li>Gold labels (conflicts, expected model, gold documents) are the author's judgement, not an external benchmark.</li>
<li>The scripted stakeholder always takes the recommended option, so answers are less varied than real interviews.</li>
<li>Free-tier rate limits make the fallback chain switch models; the models column shows what actually answered.</li></ul>
<h2>Rerun</h2><p><code>.tools/bin/uv.exe run python tests/eval.py groq/openai/gpt-oss-120b</code> (about 20 minutes; <code>mock</code> for a dry run). Results go to <code>data/eval.json</code> and the Evaluation page.</p>
<h2>Gold questions</h2><ol>{qs}</ol>
<p style="color:#6B7280">Demo script: <a href="demo-script.md">demo-script.md</a> · Q&amp;A: <a href="qa.md">qa.md</a></p>"""
(root / "data" / "evaluation.html").write_text(page, encoding="utf-8")
print("written")
