"""Load the content directory into an in-memory store.

Files are the source of truth. The store is rebuilt wholesale on change, which
is fast enough at this scale (dozens of small files) and avoids any partial-state
bugs from incremental invalidation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from app.content.parser import ContentError, parse_lesson_file, parse_vocab_bank_file
from app.models.schemas import CharacterItem, ContentStatus, Lesson, VocabItem

logger = logging.getLogger(__name__)


@dataclass
class LoadError:
    path: str
    line: int | None
    reason: str


@dataclass
class ContentStore:
    """Parsed content plus whatever failed to parse."""

    lessons: dict[str, Lesson] = field(default_factory=dict)
    vocab: dict[str, VocabItem] = field(default_factory=dict)
    characters: dict[str, CharacterItem] = field(default_factory=dict)
    errors: list[LoadError] = field(default_factory=list)

    @property
    def lesson_list(self) -> list[Lesson]:
        """Curriculum order: week, then day, then title."""
        return sorted(
            self.lessons.values(),
            key=lambda lesson: (lesson.week, lesson.day if lesson.day is not None else 99, lesson.title),
        )

    @property
    def vocab_list(self) -> list[VocabItem]:
        return list(self.vocab.values())

    @property
    def character_list(self) -> list[CharacterItem]:
        return list(self.characters.values())

    @property
    def srs_item_ids(self) -> list[str]:
        """Everything that gets a scheduling row: words and script characters."""
        return [*self.vocab.keys(), *self.characters.keys()]

    def vocab_for_lesson(self, lesson_id: str) -> list[VocabItem]:
        lesson = self.lessons.get(lesson_id)
        return list(lesson.vocab) if lesson else []

    @property
    def has_real_content(self) -> bool:
        """True once at least one lesson is marked final."""
        return any(lesson.status is ContentStatus.FINAL for lesson in self.lessons.values())


def _merge_vocab(target: dict[str, VocabItem], items: list[VocabItem]) -> None:
    """Merge items into the global pool, keeping one canonical entry per word.

    A word can appear both in a category bank and in the lesson that introduces
    it. The first entry wins, but a later entry can supply a source lesson and
    pull the introduced week earlier.
    """
    for item in items:
        existing = target.get(item.id)
        if existing is None:
            target[item.id] = item
            continue
        if existing.source_lesson_id is None and item.source_lesson_id is not None:
            existing.source_lesson_id = item.source_lesson_id
        if item.introduced_week is not None:
            if existing.introduced_week is None or item.introduced_week < existing.introduced_week:
                existing.introduced_week = item.introduced_week
        if not existing.notes and item.notes:
            existing.notes = item.notes
            existing.alt_romanizations = item.alt_romanizations


def load_content(lessons_dir: Path, vocab_dir: Path) -> ContentStore:
    store = ContentStore()

    # Banks first, so lesson entries can enrich them with a source lesson.
    if vocab_dir.is_dir():
        for path in sorted(vocab_dir.glob("*.md")):
            try:
                _merge_vocab(store.vocab, parse_vocab_bank_file(path))
            except ContentError as exc:
                logger.error("Content error: %s", exc)
                store.errors.append(LoadError(path=exc.path, line=exc.line, reason=exc.reason))
            except Exception as exc:  # pragma: no cover - unexpected parser failure
                logger.exception("Failed to load vocab bank %s", path)
                store.errors.append(LoadError(path=str(path), line=None, reason=str(exc)))

    if lessons_dir.is_dir():
        for path in sorted(lessons_dir.glob("*.md")):
            try:
                lesson = parse_lesson_file(path)
            except ContentError as exc:
                logger.error("Content error: %s", exc)
                store.errors.append(LoadError(path=exc.path, line=exc.line, reason=exc.reason))
                continue
            except Exception as exc:  # pragma: no cover
                logger.exception("Failed to load lesson %s", path)
                store.errors.append(LoadError(path=str(path), line=None, reason=str(exc)))
                continue

            if lesson.id in store.lessons:
                store.errors.append(
                    LoadError(
                        path=str(path),
                        line=None,
                        reason=f"duplicate lesson id {lesson.id!r}",
                    )
                )
                continue
            store.lessons[lesson.id] = lesson
            _merge_vocab(store.vocab, lesson.vocab)
            for character in lesson.characters:
                store.characters.setdefault(character.id, character)

    logger.info(
        "Loaded %d lessons, %d vocabulary items, %d characters, %d errors",
        len(store.lessons),
        len(store.vocab),
        len(store.characters),
        len(store.errors),
    )
    return store
