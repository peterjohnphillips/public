"""Shared database operations used by more than one router."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from app.models.db_models import DailyStreak, LessonProgress, VocabProgress
from app.srs.scheduler import initial_state


def ensure_vocab_rows(session: Session, vocab_ids: list[str]) -> int:
    """Create scheduling rows for content vocabulary that has none yet.

    Runs on startup and whenever content reloads, so adding words to a markdown
    file makes them reviewable immediately with no migration step.
    """
    if not vocab_ids:
        return 0
    existing = set(session.exec(select(VocabProgress.vocab_id)).all())
    missing = [vid for vid in vocab_ids if vid not in existing]
    if not missing:
        return 0

    state = initial_state()
    for vocab_id in missing:
        session.add(
            VocabProgress(
                vocab_id=vocab_id,
                ease_factor=state.ease_factor,
                interval_days=state.interval_days,
                repetitions=state.repetitions,
                due_date=state.due_date,
            )
        )
    session.commit()
    return len(missing)


def get_or_create_streak(session: Session, day: date | None = None) -> DailyStreak:
    day = day or date.today()
    row = session.get(DailyStreak, day)
    if row is None:
        row = DailyStreak(day=day, minutes_active=0, sessions_completed=0)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def record_activity(
    session: Session,
    *,
    minutes: int = 0,
    sessions: int = 0,
    day: date | None = None,
) -> DailyStreak:
    row = get_or_create_streak(session, day)
    row.minutes_active += max(0, minutes)
    row.sessions_completed += max(0, sessions)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def active_days(session: Session) -> list[date]:
    """Every day with recorded activity, most recent first."""
    rows = session.exec(
        select(DailyStreak).order_by(DailyStreak.day.desc())  # type: ignore[attr-defined]
    ).all()
    return [row.day for row in rows if row.minutes_active > 0 or row.sessions_completed > 0]


def streak_lengths(days: list[date], today: date | None = None) -> tuple[int, int]:
    """Current and longest run of consecutive active days.

    The current streak survives until a day is fully skipped: practising
    yesterday but not yet today still counts, so the number does not drop to
    zero every morning.
    """
    if not days:
        return 0, 0
    today = today or date.today()
    ordered = sorted(set(days))

    longest = 1
    run = 1
    for previous, current in zip(ordered, ordered[1:], strict=False):
        if (current - previous).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)

    latest = ordered[-1]
    if (today - latest).days > 1:
        return 0, longest

    current_run = 1
    for previous, current in zip(reversed(ordered[:-1]), reversed(ordered), strict=False):
        if (current - previous).days == 1:
            current_run += 1
        else:
            break
    return current_run, longest


def get_or_create_lesson_progress(session: Session, lesson_id: str) -> LessonProgress:
    row = session.exec(
        select(LessonProgress).where(LessonProgress.lesson_id == lesson_id)
    ).first()
    if row is None:
        row = LessonProgress(lesson_id=lesson_id, status="not_started")
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def mark_lesson_started(session: Session, lesson_id: str) -> LessonProgress:
    row = get_or_create_lesson_progress(session, lesson_id)
    if row.status == "not_started":
        row.status = "in_progress"
        row.first_started_at = datetime.now(timezone.utc)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def yesterday(today: date | None = None) -> date:
    return (today or date.today()) - timedelta(days=1)
