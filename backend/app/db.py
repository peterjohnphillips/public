"""SQLite engine and session management."""

from __future__ import annotations

from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings
from app.models import db_models  # noqa: F401  (registers tables on SQLModel.metadata)

_settings = get_settings()
_settings.data_dir.mkdir(parents=True, exist_ok=True)

# check_same_thread=False because FastAPI serves requests from a threadpool.
engine = create_engine(
    _settings.db_url,
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    """Create any missing tables. No migration framework at this scale."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
