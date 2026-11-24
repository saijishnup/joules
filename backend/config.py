"""Settings, model chain and input caps, read once from .env."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
env = os.getenv

DATA = Path(env("JOULES_DATA", str(ROOT / "data")))  # tests point this at a temp folder
DB_PATH = Path(env("JOULES_DB", str(DATA / "joules.db")))
FIXTURES = ROOT / "tests" / "fixtures"
SOURCES_RAW = ROOT / "sources-raw"
MANIFEST = ROOT / "sources" / "manifest.csv"
PUBLIC_ONLY = env("PUBLIC_ONLY", "1") == "1"  # deploys use only redistributable sources

# LLM: one OpenAI-compatible gateway (omniroute) + local Ollama; "mock" serves tests/fixtures.
GATEWAY_URL = env("GATEWAY_URL", "http://localhost:20128/v1")
GATEWAY_KEY = env("OMNIROUTE_API_KEY", "")
OLLAMA_URL = env("OLLAMA_URL", "http://localhost:11434/v1")
CHAIN = env(
    "MODEL_CHAIN", "groq/openai/gpt-oss-120b,gemini/gemini-3.1-flash-lite,groq/qwen/qwen3.8-27b,ollama/qwen3.5:4b,mock"
).split(",")
JUDGE = env("JUDGE_MODEL", "gemini/gemini-3.8-flash,gemini/gemini-3.1-flash-lite").split(",")
DEFAULT_MODEL = env("DEFAULT_MODEL", "mock")  # demo default; pick a live model in the UI
LLM_TIMEOUT = float(env("LLM_TIMEOUT", "90"))
LLM_MAX_TOKENS = int(env("LLM_MAX_TOKENS", "8192"))

# Seeded demo user (M2); no password in env = no demo user.
DEMO_EMAIL = env("DEMO_EMAIL", "admin@joules.app")
PASSWORD = env("PASSWORD", "")
SESSION_DAYS = 7

# Input caps (PRD §16) and in-memory rate limits (NFR-03).
BRIEF_WORDS, UPLOAD_WORDS, ANSWER_WORDS, FEEDBACK_WORDS, EDIT_WORDS = 1500, 8000, 100, 100, 60
UPLOAD_BYTES, MAX_UPLOADS, NAME_CHARS = 5 * 1024 * 1024, 2, 80
LOGIN_PER_MIN, RUNS_PER_HOUR, LLM_PER_HOUR = 5, 10, 60
