"""Rebuild the content cache when files under content/ change (dev only)."""

from __future__ import annotations

import logging
import threading
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from app.content.loader import ContentCache

logger = logging.getLogger(__name__)

DEBOUNCE_SECONDS = 0.4


class _ReloadHandler(FileSystemEventHandler):
    """Coalesces the burst of events an editor emits for a single save."""

    def __init__(self, cache: ContentCache) -> None:
        self._cache = cache
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def on_any_event(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        src = str(getattr(event, "src_path", "") or "")
        if not src.endswith(".md"):
            return
        with self._lock:
            if self._timer is not None:
                self._timer.cancel()
            self._timer = threading.Timer(DEBOUNCE_SECONDS, self._reload)
            self._timer.daemon = True
            self._timer.start()

    def _reload(self) -> None:
        try:
            store = self._cache.reload()
            logger.info("Content reloaded: %d lessons", len(store.lessons))
        except Exception:  # pragma: no cover - never kill the watcher thread
            logger.exception("Content reload failed")


def start_watcher(cache: ContentCache, content_dir: Path) -> Observer | None:
    if not content_dir.is_dir():
        logger.warning("Content directory %s does not exist; watcher not started", content_dir)
        return None
    observer = Observer()
    observer.schedule(_ReloadHandler(cache), str(content_dir), recursive=True)
    observer.daemon = True
    observer.start()
    logger.info("Watching %s for content changes", content_dir)
    return observer
