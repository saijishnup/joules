"""Sources build on a tiny generated PDF, then STAIR-lite search returns doc › section › page citations."""

import asyncio
import csv

import pymupdf

import config
import db
import retrieval
import sources_build

TOPICS = [
    ("Grid code", "Large loads ride through grid frequency events between 49.5 Hz and 50.5 Hz without tripping."),
    ("Efficiency", "Data centre operators report power usage effectiveness PUE and annual energy use every year."),
    ("Carbon", "Companies report Scope 2 emissions with both the location-based and market-based methods."),
]


def make_sources(tmp_path):
    raw = tmp_path / "raw"
    (raw / "energy").mkdir(parents=True)
    doc = pymupdf.open()
    for _, text in TOPICS:
        doc.new_page().insert_textbox(pymupdf.Rect(72, 72, 520, 700), (text + " ") * 4)
    doc.set_toc([[1, title, i] for i, (title, _) in enumerate(TOPICS, 1)])
    doc.save(raw / "energy" / "test-doc.pdf")
    manifest = tmp_path / "manifest.csv"
    with manifest.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(
            [
                ["file", "area", "title", "link", "public"],
                ["energy/test-doc.pdf", "energy", "Test Doc", "https://example.org", "yes"],
            ]
        )
    return raw, manifest


def test_build_and_search(tmp_path):
    raw, manifest = make_sources(tmp_path)
    sources_build.build(raw, manifest, config.DATA / "index")
    retrieval.index.cache_clear()
    assert retrieval.stage1("PUE energy reporting")[0]["section"] == "Efficiency"
    db.init()
    user = db.one("SELECT id FROM users") or {"id": db.add_user("r@test.local", "R", "longpass1")}
    pid = db.run("INSERT INTO projects(owner_id, name) VALUES (?,?)", user["id"], "R")
    got = asyncio.run(retrieval.search("PUE energy reporting", model="mock", project_id=pid))
    assert got[0]["ref"] == "Test Doc › Efficiency › p. 2" and got[0]["tier"] == "picked"
    assert len(got) == 3 and len(got[0]["snippet"].split()) <= 40
