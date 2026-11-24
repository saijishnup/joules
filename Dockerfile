# Joules public image: React build + FastAPI + the public-only index. Port 8000.
FROM node:24-slim AS ui
WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
# bake the Chroma embedder (MiniLM) so the first request needs no download
RUN uv run --no-sync python -c "from chromadb.utils.embedding_functions import DefaultEmbeddingFunction as D; D()(['warm up'])"
COPY backend backend
COPY sources/manifest.csv sources/manifest.csv
COPY tests/fixtures tests/fixtures
COPY data/index/public data/index/public
COPY --from=ui /ui/dist frontend/dist
ENV PUBLIC_ONLY=1 DEFAULT_MODEL=mock SIGNUPS=off
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000"]
