"""SM-2-lite spaced repetition scheduling.

Chosen over Leitner boxes because a compressed four-week schedule carrying ~900
words needs finer interval tuning than fixed boxes and binary right/wrong allow.

Quality scale (0-5) as produced by the four-button grading UI:
    0-1  Again  (failed)
    2-3  Hard   (3 is a marginal pass)
    4    Good
    5    Easy
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

MIN_EASE_FACTOR = 1.3
DEFAULT_EASE_FACTOR = 2.5
PASS_THRESHOLD = 3

# Mastery bucket cutoffs, in days of current interval.
LEARNING_MAX_INTERVAL = 1
YOUNG_MAX_INTERVAL = 21


@dataclass(frozen=True)
class SrsState:
    ease_factor: float
    interval_days: int
    repetitions: int
    due_date: date


def grade_from_correctness(
    was_correct: bool,
    *,
    response_time_ms: int | None = None,
    fast_threshold_ms: int = 4000,
) -> int:
    """Derive a quality score for modes that do not ask the user to self-grade.

    Multiple choice and matching are still legitimate review events, so they feed
    the scheduler; they just infer quality from correctness and speed instead of
    asking. A wrong answer scores 1 rather than 0 because recognition failure is
    weaker evidence of forgetting than failed free recall.
    """
    if not was_correct:
        return 1
    if response_time_ms is not None and response_time_ms <= fast_threshold_ms:
        return 5
    return 4


def next_state(current: SrsState, quality: int, *, today: date | None = None) -> SrsState:
    """Apply one review to the scheduling state.

    A failing grade resets repetitions and drops the interval back to one day,
    but only decays the ease factor rather than zeroing it, so an item that was
    previously easy recovers faster than one that has always been hard.
    """
    if not 0 <= quality <= 5:
        raise ValueError(f"quality must be between 0 and 5, got {quality}")

    today = today or date.today()

    # Standard SM-2 ease adjustment, floored so intervals cannot collapse forever.
    delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    ease_factor = max(MIN_EASE_FACTOR, current.ease_factor + delta)

    if quality < PASS_THRESHOLD:
        repetitions = 0
        interval_days = 1
    else:
        repetitions = current.repetitions + 1
        if repetitions == 1:
            interval_days = 1
        elif repetitions == 2:
            interval_days = 6
        else:
            interval_days = max(1, round(current.interval_days * ease_factor))

    return SrsState(
        ease_factor=round(ease_factor, 4),
        interval_days=interval_days,
        repetitions=repetitions,
        due_date=today + timedelta(days=interval_days),
    )


def initial_state(*, today: date | None = None) -> SrsState:
    """A brand new item: unseen, due immediately."""
    today = today or date.today()
    return SrsState(
        ease_factor=DEFAULT_EASE_FACTOR,
        interval_days=0,
        repetitions=0,
        due_date=today,
    )


def mastery_bucket(repetitions: int, interval_days: int) -> str:
    """Bucket an item for the mastery chart and the per-item mastery dot."""
    if repetitions == 0:
        return "new"
    if interval_days <= LEARNING_MAX_INTERVAL:
        return "learning"
    if interval_days <= YOUNG_MAX_INTERVAL:
        return "young"
    return "mature"
