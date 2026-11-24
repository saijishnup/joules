"""Point every test at a throwaway SQLite file before backend modules load."""

import os
import tempfile

TMP = tempfile.mkdtemp()
os.environ["JOULES_DATA"] = TMP  # no source index here, so API tests run without retrieval
os.environ["JOULES_DB"] = os.path.join(TMP, "test.db")
os.environ["DEMO_PASSWORD"] = "demo-pass-for-tests"
