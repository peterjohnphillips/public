from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(scope="session")
def content_dir() -> Path:
    return REPO_ROOT / "content"


@pytest.fixture(scope="session")
def lessons_dir(content_dir: Path) -> Path:
    return content_dir / "lessons"


@pytest.fixture(scope="session")
def vocab_dir(content_dir: Path) -> Path:
    return content_dir / "vocab"
