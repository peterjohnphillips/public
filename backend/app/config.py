"""Application settings and filesystem paths."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/app -> backend -> <repo root>
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime settings, overridable via environment variables (NEPALI_ prefix)."""

    model_config = SettingsConfigDict(env_prefix="NEPALI_", env_file=".env", extra="ignore")

    env: str = "dev"

    # Content is the source of truth for all lesson material.
    content_dir: Path = REPO_ROOT / "content"

    # Generated state. Created on first run.
    data_dir: Path = REPO_ROOT / "data"
    db_filename: str = "nepali.db"

    # Vite dev server origins allowed through CORS.
    cors_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )

    # Watch the content directory and rebuild the cache on change.
    # Only meaningful in dev; harmless but pointless in a frozen deployment.
    content_hot_reload: bool = True

    @property
    def lessons_dir(self) -> Path:
        return self.content_dir / "lessons"

    @property
    def vocab_dir(self) -> Path:
        return self.content_dir / "vocab"

    @property
    def db_path(self) -> Path:
        return self.data_dir / self.db_filename

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.db_path.as_posix()}"

    @property
    def is_dev(self) -> bool:
        return self.env == "dev"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
