"""Point every test at a throwaway SQLite file before backend modules load."""

import os
import tempfile

os.environ["JOULES_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DEMO_PASSWORD"] = "demo-pass-for-tests"
