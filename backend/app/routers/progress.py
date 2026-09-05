"""Progress, streaks and mastery statistics."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlmodel import select

from app.curriculum import PHASES, current_day, phase_for_day, week_for_day
from app.deps import SessionDep, StoreDep
from app.models.db_models import (
    AudioProgress,
    DailyStreak,
    GameSession,
    LessonProgress,
    VocabProgress,
)
from app.models.schemas import (
    AudioProgressIn,
    CategoryMastery,
    ContentStatus,
    GameModeStat,
    ListeningStats,
    ProgressSummary,
    StreakDay,
    VocabCategory,
    VocabMastery,
    WeakItem,
)
from app.services import active_days, streak_lengths
from app.srs.scheduler import mastery_bucket

router = APIRouter(prefix="/progress", tags=["progress"])

# Roughly how long one sentence of audio takes to hear, used to turn a count of
# listened spans into a minutes figure without storing real playback timings.
SECONDS_PER_SPAN_ESTIMATE = 5


@router.get("/summary", response_model=ProgressSummary)
def summary(session: SessionDep, store: StoreDep) -> ProgressSummary:
    today = date.today()

    days = active_days(session)
    streak, longest = streak_lengths(days, today)
    practiced_today = today in set(days)
    today_row = session.get(DailyStreak, today)

    vocab_rows = session.exec(select(VocabProgress)).all()
    known_ids = set(store.vocab.keys())
    relevant = [row for row in vocab_rows if row.vocab_id in known_ids]
    due_count = sum(1 for row in relevant if row.due_date <= today)
    introduced = sum(1 for row in relevant if row.repetitions > 0)

    lesson_rows = {row.lesson_id: row for row in session.exec(select(LessonProgress)).all()}
    real_lessons = [
        lesson for lesson in store.lesson_list if lesson.status is not ContentStatus.STUB
    ]
    completed = sum(
        1
        for lesson in real_lessons
        if lesson_rows.get(lesson.id) and lesson_rows[lesson.id].status == "completed"
    )

    day_index = current_day(len(days), practiced_today)
    phase = phase_for_day(day_index)

    week_start = today - timedelta(days=today.weekday())
    sessions_this_week = len(
        session.exec(
            select(GameSession)
            .where(GameSession.completed_at.is_not(None))  # type: ignore[union-attr]
            .where(GameSession.started_at >= datetime.combine(week_start, datetime.min.time()))
        ).all()
    )

    return ProgressSummary(
        streak_days=streak,
        longest_streak_days=longest,
        practiced_today=practiced_today,
        minutes_today=today_row.minutes_active if today_row else 0,
        sessions_today=today_row.sessions_completed if today_row else 0,
        vocab_due_count=due_count,
        vocab_total=len(known_ids),
        vocab_introduced=introduced,
        lessons_completed=completed,
        lessons_total=len(store.lessons),
        lessons_with_content=len(real_lessons),
        curriculum_day=day_index,
        curriculum_week=week_for_day(day_index),
        week_focus=phase.focus,
        sessions_this_week=sessions_this_week,
        content_is_placeholder=not store.has_real_content,
    )


@router.get("/streak", response_model=list[StreakDay])
def streak_calendar(
    session: SessionDep, days: int = Query(default=56, ge=7, le=365)
) -> list[StreakDay]:
    """One entry per day for the heatmap, including days with no activity."""
    today = date.today()
    start = today - timedelta(days=days - 1)
    rows = {
        row.day: row
        for row in session.exec(select(DailyStreak).where(DailyStreak.day >= start)).all()
    }
    calendar: list[StreakDay] = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        row = rows.get(day)
        calendar.append(
            StreakDay(
                date=day,
                minutes_active=row.minutes_active if row else 0,
                sessions_completed=row.sessions_completed if row else 0,
                day_curriculum_index=row.day_curriculum_index if row else None,
            )
        )
    return calendar


@router.get("/vocab-mastery", response_model=VocabMastery)
def vocab_mastery(session: SessionDep, store: StoreDep) -> VocabMastery:
    rows = {row.vocab_id: row for row in session.exec(select(VocabProgress)).all()}

    buckets: dict[VocabCategory, dict[str, int]] = {
        category: {"new": 0, "learning": 0, "young": 0, "mature": 0}
        for category in VocabCategory
    }
    for item in store.vocab_list:
        row = rows.get(item.id)
        bucket = mastery_bucket(row.repetitions, row.interval_days) if row else "new"
        buckets[item.category][bucket] += 1

    categories = [
        CategoryMastery(
            category=category,
            new=counts["new"],
            learning=counts["learning"],
            young=counts["young"],
            mature=counts["mature"],
            total=sum(counts.values()),
        )
        for category, counts in buckets.items()
    ]

    totals = CategoryMastery(
        category=VocabCategory.PEOPLE,  # placeholder; the totals row ignores category
        new=sum(c.new for c in categories),
        learning=sum(c.learning for c in categories),
        young=sum(c.young for c in categories),
        mature=sum(c.mature for c in categories),
        total=sum(c.total for c in categories),
    )

    days = active_days(session)
    day_index = current_day(len(days), date.today() in set(days))
    phase = phase_for_day(day_index)

    return VocabMastery(
        categories=categories,
        totals=totals,
        milestone_target=phase.vocab_target,
        milestone_label=f"{phase.label}: {phase.vocab_target} words",
    )


@router.get("/game-modes", response_model=list[GameModeStat])
def game_mode_stats(session: SessionDep) -> list[GameModeStat]:
    rows = session.exec(
        select(GameSession).where(GameSession.completed_at.is_not(None))  # type: ignore[union-attr]
    ).all()

    grouped: dict[str, dict] = {}
    for row in rows:
        entry = grouped.setdefault(
            row.game_mode,
            {"sessions": 0, "items": 0, "correct": 0, "last": None},
        )
        entry["sessions"] += 1
        entry["items"] += row.total_items
        entry["correct"] += row.correct_items
        if entry["last"] is None or (row.completed_at and row.completed_at > entry["last"]):
            entry["last"] = row.completed_at

    stats = [
        GameModeStat(
            game_mode=mode,
            sessions=entry["sessions"],
            items=entry["items"],
            correct=entry["correct"],
            accuracy=(entry["correct"] / entry["items"]) if entry["items"] else None,
            last_played_at=entry["last"],
        )
        for mode, entry in grouped.items()
    ]
    stats.sort(key=lambda s: s.sessions, reverse=True)
    return stats


@router.get("/weakest", response_model=list[WeakItem])
def weakest_items(
    session: SessionDep, store: StoreDep, limit: int = Query(default=20, ge=1, le=100)
) -> list[WeakItem]:
    """Reviewed items with the lowest ease factor: the drill-these-now list."""
    rows = session.exec(
        select(VocabProgress)
        .where(VocabProgress.total_reviews > 0)
        .order_by(VocabProgress.ease_factor, VocabProgress.due_date)  # type: ignore[arg-type]
    ).all()

    results: list[WeakItem] = []
    for row in rows:
        item = store.vocab.get(row.vocab_id)
        if item is None:
            continue
        results.append(
            WeakItem(
                vocab_id=row.vocab_id,
                devanagari=item.devanagari,
                romanized=item.romanized,
                english=item.english,
                category=item.category,
                ease_factor=row.ease_factor,
                total_reviews=row.total_reviews,
                total_correct=row.total_correct,
                accuracy=(row.total_correct / row.total_reviews) if row.total_reviews else None,
            )
        )
        if len(results) >= limit:
            break
    return results


@router.get("/listening", response_model=ListeningStats)
def listening_stats(session: SessionDep) -> ListeningStats:
    rows = session.exec(select(AudioProgress)).all()
    spans = sum(row.spans_listened for row in rows)
    seconds = sum(row.seconds_listened for row in rows)
    if seconds == 0:
        seconds = spans * SECONDS_PER_SPAN_ESTIMATE
    return ListeningStats(
        spans_listened=spans,
        minutes_listened=round(seconds / 60),
        passages_completed=sum(1 for row in rows if row.completed),
        lessons_with_audio_progress=len(rows),
    )


@router.post("/audio", response_model=ListeningStats)
def sync_audio_progress(payload: AudioProgressIn, session: SessionDep) -> ListeningStats:
    """Mirror the browser's local audio record into SQLite.

    Local storage owns the live playback position; this roll-up is what makes
    listening minutes survive a cleared browser. Span ids are unioned rather
    than replaced so replaying an older snapshot cannot lose progress.
    """
    row = session.exec(
        select(AudioProgress).where(AudioProgress.lesson_id == payload.lesson_id)
    ).first()
    if row is None:
        row = AudioProgress(lesson_id=payload.lesson_id)

    try:
        existing_ids = set(json.loads(row.span_ids_json))
    except (ValueError, TypeError):
        existing_ids = set()
    merged = existing_ids | set(payload.span_ids_listened)

    row.span_ids_json = json.dumps(sorted(merged))
    row.spans_listened = len(merged)
    row.seconds_listened = max(row.seconds_listened, payload.seconds_listened)
    row.completed = row.completed or payload.completed
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()

    return listening_stats(session)


@router.get("/curriculum")
def curriculum_phases() -> list[dict]:
    """The four-week plan, for the timeline on the stats page."""
    return [
        {
            "key": phase.key,
            "label": phase.label,
            "focus": phase.focus,
            "first_day": phase.first_day,
            "last_day": phase.last_day,
            "vocab_target": phase.vocab_target,
            "daily_minutes": phase.daily_minutes,
        }
        for phase in PHASES
    ]
