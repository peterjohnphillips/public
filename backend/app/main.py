"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.config import get_settings
from app.content.loader import ContentCache
from app.content.watcher import start_watcher
from app.db import engine, init_db
from app.deps import CacheDep, SessionDep, StoreDep
from app.routers import lessons, progress, sessions, settings as settings_router, vocab
from app.services import ensure_vocab_rows

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()


def _sync_srs_rows(cache: ContentCache) -> int:
    with Session(engine) as session:
        created = ensure_vocab_rows(session, cache.store.srs_item_ids)
    if created:
        logger.info("Created %d new scheduling rows for content items", created)
    return created


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    cache = ContentCache(settings.lessons_dir, settings.vocab_dir)
    app.state.content_cache = cache
    _sync_srs_rows(cache)

    observer = None
    if settings.content_hot_reload:
        observer = start_watcher(cache, settings.content_dir)

    for error in cache.store.errors:
        location = f"{error.path}:{error.line}" if error.line else error.path
        logger.error("Content error at %s: %s", location, error.reason)

    yield

    if observer is not None:
        observer.stop()
        observer.join(timeout=2)


app = FastAPI(title="Nepali Trainer", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = "/api"
app.include_router(lessons.router, prefix=api_prefix)
app.include_router(vocab.router, prefix=api_prefix)
app.include_router(sessions.router, prefix=api_prefix)
app.include_router(progress.router, prefix=api_prefix)
app.include_router(settings_router.router, prefix=api_prefix)


@app.get("/api/health", tags=["meta"])
def health(store: StoreDep) -> dict:
    return {
        "status": "ok",
        "lessons": len(store.lessons),
        "vocab": len(store.vocab),
        "characters": len(store.characters),
        "content_errors": len(store.errors),
    }


@app.get("/api/content/errors", tags=["meta"])
def content_errors(store: StoreDep) -> list[dict]:
    """Files that failed to parse, so the UI can show them rather than silently
    presenting a shorter lesson list."""
    return [
        {"path": error.path, "line": error.line, "reason": error.reason}
        for error in store.errors
    ]


@app.post("/api/content/reload", tags=["meta"])
def reload_content(cache: CacheDep, session: SessionDep) -> dict:
    """Force a content rebuild. The watcher does this automatically in dev;
    this endpoint exists for when the watcher is off or a file arrives from
    outside the watched tree."""
    store = cache.reload()
    created = ensure_vocab_rows(session, store.srs_item_ids)
    return {
        "lessons": len(store.lessons),
        "vocab": len(store.vocab),
        "characters": len(store.characters),
        "new_srs_rows": created,
        "errors": [
            {"path": error.path, "line": error.line, "reason": error.reason}
            for error in store.errors
        ],
    }
