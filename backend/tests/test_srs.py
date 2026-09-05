"""SM-2-lite scheduler: the edge cases the plan called out explicitly."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.srs.scheduler import (
    DEFAULT_EASE_FACTOR,
    MIN_EASE_FACTOR,
    SrsState,
    grade_from_correctness,
    initial_state,
    mastery_bucket,
    next_state,
)

TODAY = date(2026, 1, 1)


def test_initial_state_is_due_today_and_unseen():
    state = initial_state(today=TODAY)
    assert state.ease_factor == DEFAULT_EASE_FACTOR
    assert state.repetitions == 0
    assert state.interval_days == 0
    assert state.due_date == TODAY


def test_first_review_pass_sets_one_day_interval():
    state = next_state(initial_state(today=TODAY), quality=4, today=TODAY)
    assert state.repetitions == 1
    assert state.interval_days == 1
    assert state.due_date == TODAY + timedelta(days=1)


def test_second_review_pass_sets_six_day_interval():
    state = initial_state(today=TODAY)
    state = next_state(state, quality=4, today=TODAY)
    state = next_state(state, quality=4, today=TODAY + timedelta(days=1))
    assert state.repetitions == 2
    assert state.interval_days == 6


def test_third_pass_multiplies_by_ease_factor():
    state = initial_state(today=TODAY)
    state = next_state(state, quality=4, today=TODAY)
    state = next_state(state, quality=4, today=TODAY)
    ease_before_third = state.ease_factor
    state = next_state(state, quality=4, today=TODAY)
    assert state.repetitions == 3
    assert state.interval_days == round(6 * ease_before_third)


def test_failing_grade_resets_repetitions_and_interval():
    state = initial_state(today=TODAY)
    state = next_state(state, quality=5, today=TODAY)
    state = next_state(state, quality=5, today=TODAY)
    state = next_state(state, quality=5, today=TODAY)
    assert state.repetitions == 3
    ease_before_fail = state.ease_factor

    failed = next_state(state, quality=0, today=TODAY)
    assert failed.repetitions == 0
    assert failed.interval_days == 1
    assert failed.due_date == TODAY + timedelta(days=1)
    # Ease decays but is not zeroed - a previously-easy item still recovers
    # faster than one that was always hard.
    assert failed.ease_factor < ease_before_fail
    assert failed.ease_factor > MIN_EASE_FACTOR


def test_fail_then_recover_rebuilds_the_short_ladder():
    state = initial_state(today=TODAY)
    state = next_state(state, quality=5, today=TODAY)
    state = next_state(state, quality=0, today=TODAY)
    assert state.repetitions == 0

    state = next_state(state, quality=4, today=TODAY)
    assert state.repetitions == 1
    assert state.interval_days == 1

    state = next_state(state, quality=4, today=TODAY)
    assert state.repetitions == 2
    assert state.interval_days == 6


def test_ease_factor_has_a_floor():
    state = initial_state(today=TODAY)
    for _ in range(50):
        state = next_state(state, quality=0, today=TODAY)
    assert state.ease_factor >= MIN_EASE_FACTOR
    assert state.ease_factor == pytest.approx(MIN_EASE_FACTOR, abs=1e-6)


def test_easy_grades_grow_ease_factor_above_default():
    state = initial_state(today=TODAY)
    for _ in range(5):
        state = next_state(state, quality=5, today=TODAY)
    assert state.ease_factor > DEFAULT_EASE_FACTOR


def test_quality_out_of_range_is_rejected():
    with pytest.raises(ValueError):
        next_state(initial_state(today=TODAY), quality=6, today=TODAY)
    with pytest.raises(ValueError):
        next_state(initial_state(today=TODAY), quality=-1, today=TODAY)


def test_marginal_pass_quality_three_still_advances_repetitions():
    state = next_state(initial_state(today=TODAY), quality=3, today=TODAY)
    assert state.repetitions == 1


# --------------------------------------------------------------------------
# Quality inference for modes that do not self-grade
# --------------------------------------------------------------------------

def test_grade_from_correctness_wrong_answer_is_low_but_not_zero():
    assert grade_from_correctness(False) == 1


def test_grade_from_correctness_fast_correct_is_five():
    assert grade_from_correctness(True, response_time_ms=1500) == 5


def test_grade_from_correctness_slow_correct_is_four():
    assert grade_from_correctness(True, response_time_ms=9000) == 4


def test_grade_from_correctness_no_timing_defaults_to_good():
    assert grade_from_correctness(True, response_time_ms=None) == 4


# --------------------------------------------------------------------------
# Mastery buckets
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "repetitions,interval_days,expected",
    [
        (0, 0, "new"),
        (1, 1, "learning"),
        (2, 6, "young"),
        (3, 21, "young"),
        (4, 22, "mature"),
        (6, 400, "mature"),
    ],
)
def test_mastery_bucket(repetitions, interval_days, expected):
    assert mastery_bucket(repetitions, interval_days) == expected
