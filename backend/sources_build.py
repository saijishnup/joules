"""Build STAIR-lite indexes: a ToC tree per document, leaf sections as chunks, saved as JSON + Chroma (full, public)."""

import csv
import json
import re
import shutil
import statistics
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

import chromadb
import pymupdf

import config

INDEX = config.DATA / "index"
TESSDATA = "C:/Program Files/Tesseract-OCR/tessdata"  # Tesseract is not on PATH on the dev laptop
MAX_PAGES = 2  # a long section is cut into 2-page parts so every citation has a precise page


def page_texts(doc: pymupdf.Document) -> list[str]:
    """Text per page; pages with no text layer are scanned images, so OCR them once."""
    out = []
    for page in doc:
        text = page.get_text()
        if len(text.strip()) < 30 and page.get_images() and Path(TESSDATA).exists():
            text = page.get_text(textpage=page.get_textpage_ocr(dpi=200, full=True, tessdata=TESSDATA))
        out.append(text)
    return out


def font_headings(doc: pymupdf.Document) -> list[tuple[int, str, int]]:
    """No outline: short lines in a larger font (level 1) or fully bold (level 2) are headings."""
    lines, sizes = [], []
    for pno, page in enumerate(doc, 1):
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = " ".join(s["text"] for s in line["spans"]).strip()
                size = max((s["size"] for s in line["spans"]), default=0)
                bold = all(s["flags"] & 16 for s in line["spans"] if s["text"].strip())
                sizes += [round(size)] * len(text)
                lines.append((size, bold, text, pno))
    if not sizes:
        return []
    body = statistics.mode(sizes)
    heads = []
    for size, bold, text, pno in lines:
        if 2 < len(text) < 90 and re.match("[A-Z0-9(]", text) and re.search("[A-Za-z]{3}", text):
            if size >= body * 1.25:
                heads.append((1, text, pno))
            elif bold and round(size) >= body:
                heads.append((2, text, pno))
    return heads


def outline(doc: pymupdf.Document) -> tuple[str, list[tuple[int, str, int]]]:
    """ToC tree: embedded outline, else font-size headings, else 3-page windows (PRD §11)."""
    toc = [(lvl, title.strip(), page) for lvl, title, page in doc.get_toc() if page > 0 and title.strip()]
    if len(toc) >= 3:
        return "outline", toc
    if len(heads := font_headings(doc)) >= 3:
        return "fonts", heads
    return "pages", [(1, f"Pages {p}-{min(p + 2, doc.page_count)}", p) for p in range(1, doc.page_count + 1, 3)]


def leaves_of(entries: list[tuple[int, str, int]], pages: list[str]) -> list[dict]:
    """Every ToC entry spans until the next entry; its breadcrumb is the path of titles above it."""
    out, path = [], []
    entries = [(1, "Front matter", 1), *entries] if entries[0][2] > 1 else entries
    for i, (lvl, title, start) in enumerate(entries):
        path = [*path[: lvl - 1], title]
        nxt = entries[i + 1] if i + 1 < len(entries) else (1, "", len(pages) + 1)
        if nxt[0] > lvl and nxt[2] == start:  # a parent whose child starts on the same page: the child covers it
            continue
        end = max(start, nxt[2] - 1)  # stop before the next heading's page
        for p in range(start, end + 1, MAX_PAGES):
            text = " ".join(" ".join(pages[p - 1 : min(p + MAX_PAGES - 1, end, len(pages))]).split())
            if len(text) > 80:
                out.append({"section": " › ".join(path), "page": p, "text": text[:6000]})
    return out


def xlsx_rows(path: Path) -> list[list[str]]:
    """Rows of the second sheet (CSA files: sheet 1 is the introduction) of an .xlsx, stdlib only."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        strings = ElementTree.fromstring(z.read("xl/sharedStrings.xml")) if "xl/sharedStrings.xml" in names else None
        sheet = ElementTree.fromstring(z.read("xl/worksheets/sheet2.xml"))
    text = lambda el: "".join(t.text or "" for t in el.iter(f"{{{ns['m']}}}t"))
    shared = [text(si) for si in strings.findall("m:si", ns)] if strings is not None else []
    rows = []
    for row in sheet.iter(f"{{{ns['m']}}}row"):
        cells = []
        for c in row.findall("m:c", ns):
            v = c.find("m:v", ns)
            val = "" if v is None else v.text or ""
            cells.append(
                shared[int(val)] if c.get("t") == "s" and val else text(c) if c.get("t") == "inlineStr" else val
            )
        rows.append(cells)
    return rows


def sheet_leaves(path: Path) -> list[dict]:
    """CSA control sheets: one leaf per control row that has an ID like ABC-01."""
    out = []
    for i, row in enumerate(xlsx_rows(path), 1):
        ids = [c for c in row if re.fullmatch(r"[A-Z]{2,4}-\d{2}(\.\d+)?", c.strip())]
        text = " ".join(c for c in row if c.strip())
        if ids and len(text) > 40:
            out.append(
                {
                    "section": f"{ids[0]} {row[1][:80] if len(row) > 1 else ''}".strip(),
                    "page": i,
                    "unit": "row",
                    "text": text,
                }
            )
    return out


def build(raw: Path = config.SOURCES_RAW, manifest: Path = config.MANIFEST, out: Path = INDEX) -> None:
    """Full index from every manifest row, then the public index as the redistributable subset (same vectors)."""
    rows = list(csv.DictReader(manifest.open(encoding="utf-8")))
    leaves = []
    for m in rows:
        path = raw / m["file"]
        if path.suffix == ".xlsx":
            got, method = sheet_leaves(path), "sheet"
        else:
            with pymupdf.open(path) as doc:
                method, entries = outline(doc)
                got = leaves_of(entries, page_texts(doc))
        stem = path.stem
        for n, leaf in enumerate(got, 1):
            leaves.append(
                leaf
                | {
                    "id": f"{stem}#{n}",
                    "doc": stem,
                    "title": m["title"],
                    "link": m["link"],
                    "area": m["area"],
                    "public": m["public"] == "yes",
                }
            )
        print(f"{stem}: {len(got)} leaves ({method})", flush=True)
    shutil.rmtree(out, ignore_errors=True)
    full = _save(out / "full", leaves)
    pub = [x for x in leaves if x["public"]]
    got = full.get(ids=[x["id"] for x in pub], include=["embeddings"]) if pub else {"ids": [], "embeddings": []}
    _save(out / "public", pub, dict(zip(got["ids"], got["embeddings"], strict=True)))
    print(f"full {len(leaves)} leaves, public {len(pub)}")


def _save(folder: Path, leaves: list[dict], vectors: dict | None = None):
    """leaves.json for BM25 + a Chroma collection (built-in MiniLM embedder) for the vector half."""
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "leaves.json").write_text(json.dumps(leaves, ensure_ascii=False), encoding="utf-8")
    col = chromadb.PersistentClient(path=str(folder / "chroma")).get_or_create_collection(
        "leaves", configuration={"hnsw": {"space": "cosine"}}
    )
    for i in range(0, len(leaves), 256):
        batch = leaves[i : i + 256]
        docs = [f"{x['title']} › {x['section']}\n{x['text'][:1500]}" for x in batch]
        emb = [vectors[x["id"]] for x in batch] if vectors else None
        col.add(ids=[x["id"] for x in batch], documents=docs, embeddings=emb)
    return col


if __name__ == "__main__":  # uv run python backend/sources_build.py
    build(*(Path(a) for a in sys.argv[1:]))
