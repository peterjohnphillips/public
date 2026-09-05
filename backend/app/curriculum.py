"""The four-week plan, expressed as data.

Progress is measured against this: which phase the user is in, what the
vocabulary target is, and which day of the schedule they have reached.
"""

from __future__ import annotations

from dataclasses import dataclass

TOTAL_DAYS = 28


@dataclass(frozen=True)
class Phase:
    key: str
    label: str
    focus: str
    first_day: int
    last_day: int
    vocab_target: int
    daily_minutes: int


PHASES: tuple[Phase, ...] = (
    Phase(
        key="days-1-3",
        label="Days 1-3",
        focus="Pronunciation, survival phrases, 100 core words",
        first_day=1,
        last_day=3,
        vocab_target=100,
        daily_minutes=165,
    ),
    Phase(
        key="days-4-7",
        label="Days 4-7",
        focus="Basic sentence construction, ~300 words",
        first_day=4,
        last_day=7,
        vocab_target=300,
        daily_minutes=165,
    ),
    Phase(
        key="week-2",
        label="Week 2",
        focus="Conversation patterns, ~600 words",
        first_day=8,
        last_day=14,
        vocab_target=600,
        daily_minutes=165,
    ),
    Phase(
        key="week-3",
        label="Week 3",
        focus="Speaking almost entirely in Nepali, ~900 words",
        first_day=15,
        last_day=21,
        vocab_target=900,
        daily_minutes=165,
    ),
    Phase(
        key="week-4",
        label="Week 4",
        focus="Fluency drilling, listening, correction",
        first_day=22,
        last_day=28,
        vocab_target=900,
        daily_minutes=165,
    ),
)


def phase_for_day(day: int) -> Phase:
    day = clamp_day(day)
    for phase in PHASES:
        if phase.first_day <= day <= phase.last_day:
            return phase
    return PHASES[-1]


def week_for_day(day: int) -> int:
    return (clamp_day(day) - 1) // 7 + 1


def clamp_day(day: int) -> int:
    return max(1, min(TOTAL_DAYS, day))


def current_day(days_practiced: int, practiced_today: bool) -> int:
    """Which day of the plan the user is on.

    Counted by days actually practised rather than calendar days since starting,
    so a missed day does not push the schedule out of reach.
    """
    if days_practiced <= 0:
        return 1
    return clamp_day(days_practiced if practiced_today else days_practiced + 1)
