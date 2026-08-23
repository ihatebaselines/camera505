"""Create the local SQLite schema without shipping runtime data."""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from src.storage.database import LifeDatabase


if __name__ == "__main__":
    db = LifeDatabase()
    print(f"[DB] Ready: {db.db_path}")
