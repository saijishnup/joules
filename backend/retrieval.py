"""STAIR-lite search: BM25 + Chroma fused by RRF (top 20 leaves), then the LLM picks the top 3 by breadcrumb."""

import json
import logging
import re
from collections import Counter
from functools import cache

import chromadb
from rank_bm25 import BM25Okapi

import agents
import config

log = logging.getLogger("joules")
STOP = {*"the and for are with that this shall from which their have been will such any its not into per all".split()}


def words(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]{3,}", text.lower()) if w not in STOP]


@cache
def index(name: str = "public" if config.PUBLIC_ONLY else "full"):
    """Load leaves + BM25 + Chroma once. Public index on deploys; full index locally (PUBLIC_ONLY=0)."""
    folder = config.DATA / "index" / name
    leaves = json.loads((folder / "leaves.json").read_text(encoding="utf-8"))
    bm25 = BM25Okapi([words(f"{x['title']} {x['section']} {x['text']}") for x in leaves])
    col = chromadb.PersistentClient(path=str(folder / "chroma")).get_collection("leaves")
    return leaves, bm25, col


def ref(leaf: dict) -> str:
    """Citation as doc › section › page (or row for spreadsheets)."""
    return f"{leaf['title']} › {leaf['section']} › {leaf.get('unit', 'p.')} {leaf['page']}"


def stage1(query: str, n: int = 20, name: str | None = None) -> list[dict]:
    """Keyword and meaning rankings merged by reciprocal rank fusion (k=60)."""
    leaves, bm25, col = index(name) if name else index()
    by_id = {x["id"]: x for x in leaves}
    scores = bm25.get_scores(words(query))
    rankings = [[leaves[i]["id"] for i in scores.argsort()[::-1][:50]]]
    try:
        rankings.append(col.query(query_texts=[query], n_results=50)["ids"][0])
    except Exception:  # noqa: BLE001 - embedder unavailable: BM25 alone is the degraded mode (NFR-04)
        log.warning("vector search failed, BM25 only")
    fused = Counter()
    for ranking in rankings:
        for rank, lid in enumerate(ranking):
            fused[lid] += 1 / (60 + rank)
    return [by_id[lid] for lid, _ in fused.most_common(n)]


async def search(query: str, *, model: str, project_id: int, k: int = 3) -> list[dict]:
    """Top k leaves with tier 'picked' (LLM stage 2) or 'stage1' (LLM failed, RRF order kept)."""
    try:
        cands = stage1(query)
    except FileNotFoundError:
        log.warning("no source index; run backend/sources_build.py")
        return []
    try:
        labels = await agents.pick(query, cands, model, project_id)
        chosen = [cands[int(c[1:]) - 1] for c in labels if re.fullmatch(r"C\d+", c) and 0 < int(c[1:]) <= len(cands)]
    except RuntimeError:  # no model answered: keep the stage-1 order
        chosen = []
    chosen = list({c["id"]: c for c in chosen}.values())[:k]  # code keeps only real, distinct candidates
    tier = "picked" if chosen else "stage1"
    return [
        {**c, "ref": ref(c), "snippet": " ".join(c["text"].split()[:40]), "tier": tier, "text": c["text"][:1500]}
        for c in chosen or cands[:k]
    ]
