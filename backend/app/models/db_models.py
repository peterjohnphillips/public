"""SQLModel tables. SQLite is the durable record for scheduling and history.

Presentation state (audio position, in-flight game answers, voice choice) lives
in browser local storage; only what must survive a cleared browser is here.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class VocabProgress(SQLModel, table=True):
    """SM-2-lite scheduling state, one row per vocabulary item.

    Rows are created lazily on startup for any content item that lacks one, so
    adding words to a markdown file needs no migration.
    """

    id: int | None = Field(default=None, primary_key=True)
    vocab_id: str = Field(index=True, unique=True)
    ease_factor: float = 2.5
    interval_days: int = 0
    repetitions: int = 0
    due_date: date
    last_reviewed_at: datetime | None = None
    last_quality: int | None = None
    total_reviews: int = 0
    total_correct: int = 0
    introduced_at: datetime = Field(default_factory=utcnow)


class ReviewLog(SQLModel, table=True):
    """Append-only review history. Never mutated; drives stats and charts."""

    id: int | None = Field(default=None, primary_key=True)
    vocab_id: str = Field(index=True)
    reviewed_at: datetime = Field(default_factory=utcnow, index=True)
    quality: int
    game_mode: str
    response_time_ms: int | None = None


class LessonProgress(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    lesson_id: str = Field(index=True, unique=True)
    status: str = "not_started"  # not_started | in_progress | completed
    first_started_at: datetime | None = None
    completed_at: datetime | None = None
    times_practiced: int = 0


class GameSession(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    game_mode: str = Field(index=True)
    lesson_id: str | None = Field(default=None, index=True)
    client_session_key: str | None = Field(default=None, index=True)
    started_at: datetime = Field(default_factory=utcnow, index=True)
    completed_at: datetime | None = None
    score: float | None = None  # normalised 0.0 - 1.0
    total_items: int = 0
    correct_items: int = 0
    duration_seconds: int | None = None


class GameSessionItem(SQLModel, table=True):
    """One answer. `item_ref` is deliberately a loose string, not a foreign key:
    it points at a vocab id, a sentence-pattern id or a span id depending on the
    game mode, which is what lets one endpoint serve every mode.
    """

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="gamesession.id", index=True)
    item_ref: str
    was_correct: bool
    response_time_ms: int | None = None
    user_answer: str | None = None
    answered_at: datetime = Field(default_factory=utcnow)
    client_answer_key: str | None = Field(default=None, index=True)


class DailyStreak(SQLModel, table=True):
    """One row per calendar day with any activity.

    Field named `day`, not `date`, because a field sharing its own type's name
    breaks Pydantic's lazy annotation resolution under
    `from __future__ import annotations` (the class namespace's own attribute
    shadows the `date` type during evaluation).
    """

    day: date = Field(primary_key=True)
    minutes_active: int = 0
    sessions_completed: int = 0
    day_curriculum_index: int | None = None


class AudioProgress(SQLModel, table=True):
    """Server-side mirror of listening progress per lesson.

    Local storage owns the live playback position; this is the durable roll-up
    so listening minutes survive a cleared browser.
    """

    id: int | None = Field(default=None, primary_key=True)
    lesson_id: str = Field(index=True, unique=True)
    spans_listened: int = 0
    span_ids_json: str = "[]"
    seconds_listened: int = 0
    completed: bool = False
    updated_at: datetime = Field(default_factory=utcnow)


class UserSettings(SQLModel, table=True):
    """Small key/value store: preferred voice, playback rate, curriculum day."""

    key: str = Field(primary_key=True)
    value: str
    updated_at: datetime = Field(default_factory=utcnow)
