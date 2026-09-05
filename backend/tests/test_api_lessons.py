"""End-to-end API tests against the real content directory and a scratch DB.

Each test gets a fresh app instance pointed at an isolated SQLite file, so
sessions/answers/SRS state from one test never leak into another.
"""

from __future__ import annotations

import importlib
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path, monkeypatch, lessons_dir: Path, vocab_dir: Path):
    db_dir = tmp_path / "data"
    monkeypatch.setenv("NEPALI_DATA_DIR", str(db_dir))
    monkeypatch.setenv("NEPALI_CONTENT_HOT_RELOAD", "false")

    # Settings and the engine are both cached at import time, so every module
    # that touches either must be reloaded fresh under the patched environment.
    import app.config as config_module

    config_module.get_settings.cache_clear()

    import app.db as db_module

    importlib.reload(db_module)

    import app.deps as deps_module

    importlib.reload(deps_module)

    import app.routers.lessons as lessons_module
    import app.routers.progress as progress_module
    import app.routers.sessions as sessions_module
    import app.routers.settings as settings_module
    import app.routers.vocab as vocab_module

    for module in (lessons_module, vocab_module, sessions_module, progress_module, settings_module):
        importlib.reload(module)

    import app.main as main_module

    importlib.reload(main_module)

    with TestClient(main_module.app) as test_client:
        yield test_client


def test_health_reports_loaded_content(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["lessons"] == 29  # 4 worked samples + script reference + 24 day stubs
    assert body["vocab"] > 40
    assert body["content_errors"] == 0


def test_list_lessons_returns_curriculum_order(client):
    response = client.get("/api/lessons")
    assert response.status_code == 200
    lessons = response.json()
    weeks = [item["week"] for item in lessons]
    assert weeks == sorted(weeks)


def test_get_lesson_detail_includes_parsed_body(client):
    response = client.get("/api/lessons/day04-sentence-patterns")
    assert response.status_code == 200
    lesson = response.json()
    assert lesson["pattern_count"] == 4
    assert lesson["patterns"][0]["template_devanagari"] == "म ___ हुँ"
    assert lesson["progress_status"] == "in_progress"  # viewing marks it started


def test_get_lesson_404_for_unknown_id(client):
    response = client.get("/api/lessons/does-not-exist")
    assert response.status_code == 404


def test_complete_lesson_updates_progress_and_streak(client):
    client.post("/api/lessons/day01-pronunciation/complete", params={"minutes": 30})
    lessons = client.get("/api/lessons", params={"week": 1}).json()
    day1 = next(item for item in lessons if item["id"] == "day01-pronunciation")
    assert day1["progress_status"] == "completed"
    assert day1["times_practiced"] == 1

    summary = client.get("/api/progress/summary").json()
    assert summary["practiced_today"] is True
    assert summary["minutes_today"] == 30


def test_vocab_due_queue_is_populated_on_startup(client):
    response = client.get("/api/vocab/due", params={"limit": 500})
    assert response.status_code == 200
    items = response.json()
    assert len(items) > 40
    assert all(item["progress"]["is_due"] for item in items)


def test_vocab_filter_by_category(client):
    response = client.get("/api/vocab", params={"category": "food"})
    items = response.json()
    assert items
    assert all(item["category"] == "food" for item in items)


# --------------------------------------------------------------------------
# Session lifecycle and SRS application
# --------------------------------------------------------------------------

def test_full_session_flow_applies_srs_and_updates_streak(client):
    start = client.post(
        "/api/sessions/start", json={"game_mode": "flashcards"}
    ).json()
    session_id = start["session_id"]
    assert start["resumed"] is False

    vocab_id = "नमस्ते-social"
    answer = client.post(
        f"/api/sessions/{session_id}/answer",
        json={"item_ref": vocab_id, "was_correct": True, "quality": 5},
    ).json()
    assert answer["srs_applied"] is True
    assert answer["next_interval_days"] == 1
    assert answer["next_due_date"] == str(date.today() + timedelta(days=1))

    finish = client.post(f"/api/sessions/{session_id}/finish").json()
    assert finish["total_items"] == 1
    assert finish["correct_items"] == 1
    assert finish["score"] == 1.0
    assert finish["streak_days"] == 1

    detail = client.get(f"/api/sessions/{session_id}").json()
    assert len(detail["items"]) == 1
    assert detail["items"][0]["item_ref"] == vocab_id


def test_vocab_item_moves_out_of_due_queue_after_a_pass(client):
    vocab_id = "नमस्ते-social"
    before = client.get(f"/api/vocab/{vocab_id}").json()
    assert before["progress"]["is_due"] is True

    start = client.post("/api/sessions/start", json={"game_mode": "flashcards"}).json()
    client.post(
        f"/api/sessions/{start['session_id']}/answer",
        json={"item_ref": vocab_id, "was_correct": True, "quality": 5},
    )

    after = client.get(f"/api/vocab/{vocab_id}").json()
    assert after["progress"]["is_due"] is False

    due_ids = {item["id"] for item in client.get("/api/vocab/due", params={"limit": 500}).json()}
    assert vocab_id not in due_ids


def test_answer_without_quality_is_inferred_from_correctness(client):
    vocab_id = "घर-places"
    start = client.post("/api/sessions/start", json={"game_mode": "multiple-choice"}).json()
    answer = client.post(
        f"/api/sessions/{start['session_id']}/answer",
        json={"item_ref": vocab_id, "was_correct": False},
    ).json()
    assert answer["srs_applied"] is True
    # A wrong answer with no explicit quality infers 1, a failing grade, so the
    # item should loop back to a 1-day interval, not push out further.
    assert answer["next_interval_days"] == 1


def test_non_srs_item_ref_is_recorded_without_scheduling(client):
    """A sentence-pattern id is a legitimate item_ref but carries no SRS state."""
    start = client.post("/api/sessions/start", json={"game_mode": "fill-in-blank"}).json()
    answer = client.post(
        f"/api/sessions/{start['session_id']}/answer",
        json={"item_ref": "day04-sentence-patterns:pattern:ma-hu", "was_correct": True},
    ).json()
    assert answer["srs_applied"] is False
    assert answer["recorded"] is True


def test_duplicate_client_answer_key_is_not_double_counted(client):
    """Outbox replay after a dropped connection must not double-count a review."""
    vocab_id = "साथी-people"
    start = client.post("/api/sessions/start", json={"game_mode": "typing"}).json()
    session_id = start["session_id"]

    payload = {
        "item_ref": vocab_id,
        "was_correct": True,
        "quality": 4,
        "client_answer_key": "outbox-key-1",
    }
    first = client.post(f"/api/sessions/{session_id}/answer", json=payload).json()
    assert first["duplicate"] is False

    second = client.post(f"/api/sessions/{session_id}/answer", json=payload).json()
    assert second["duplicate"] is True

    detail = client.get(f"/api/sessions/{session_id}").json()
    assert len(detail["items"]) == 1

    progress = client.get(f"/api/vocab/{vocab_id}").json()["progress"]
    assert progress["total_reviews"] == 1


def test_resuming_a_session_by_client_key_returns_the_same_id(client):
    payload = {"game_mode": "listening", "client_session_key": "abc-123"}
    first = client.post("/api/sessions/start", json=payload).json()
    client.post(
        f"/api/sessions/{first['session_id']}/answer",
        json={"item_ref": "घर-places", "was_correct": True},
    )

    second = client.post("/api/sessions/start", json=payload).json()
    assert second["session_id"] == first["session_id"]
    assert second["resumed"] is True
    assert "घर-places" in second["answered_item_refs"]


def test_finishing_a_session_twice_does_not_double_count_the_day(client):
    start = client.post("/api/sessions/start", json={"game_mode": "flashcards"}).json()
    session_id = start["session_id"]
    client.post(
        f"/api/sessions/{session_id}/answer",
        json={"item_ref": "घर-places", "was_correct": True},
    )
    client.post(f"/api/sessions/{session_id}/finish")
    client.post(f"/api/sessions/{session_id}/finish")

    summary = client.get("/api/progress/summary").json()
    assert summary["sessions_today"] == 1


# --------------------------------------------------------------------------
# Progress endpoints
# --------------------------------------------------------------------------

def test_streak_calendar_covers_the_requested_range(client):
    response = client.get("/api/progress/streak", params={"days": 14})
    days = response.json()
    assert len(days) == 14
    assert days[-1]["date"] == str(date.today())


def test_vocab_mastery_totals_match_vocab_count(client):
    mastery = client.get("/api/progress/vocab-mastery").json()
    total_from_categories = sum(cat["total"] for cat in mastery["categories"])
    assert total_from_categories == mastery["totals"]["total"]

    health = client.get("/api/health").json()
    assert total_from_categories == health["vocab"]


def test_weakest_items_ranks_lowest_ease_first(client):
    vocab_id = "घर-places"
    start = client.post("/api/sessions/start", json={"game_mode": "flashcards"}).json()
    client.post(
        f"/api/sessions/{start['session_id']}/answer",
        json={"item_ref": vocab_id, "was_correct": False, "quality": 0},
    )

    weakest = client.get("/api/progress/weakest").json()
    assert weakest
    assert weakest[0]["vocab_id"] == vocab_id


def test_audio_progress_sync_is_additive(client):
    lesson_id = "reading-passage-01"
    client.post(
        "/api/progress/audio",
        json={
            "lesson_id": lesson_id,
            "span_ids_listened": [f"{lesson_id}:0:0", f"{lesson_id}:0:1"],
            "seconds_listened": 10,
        },
    )
    result = client.post(
        "/api/progress/audio",
        json={
            "lesson_id": lesson_id,
            "span_ids_listened": [f"{lesson_id}:1:0"],
            "seconds_listened": 5,
        },
    ).json()
    assert result["spans_listened"] == 3
    # seconds_listened takes the max of the two syncs, not the sum, since each
    # sync carries the client's cumulative total rather than a delta.
    assert result["minutes_listened"] == 0  # 10 seconds rounds down to 0 minutes


def test_content_errors_endpoint_is_empty_for_the_real_content_dir(client):
    assert client.get("/api/content/errors").json() == []


def test_settings_roundtrip(client):
    client.put("/api/settings", json={"values": {"voice": "ne-NP-Standard-A", "rate": "0.85"}})
    stored = client.get("/api/settings").json()
    assert stored["voice"] == "ne-NP-Standard-A"
    assert stored["rate"] == "0.85"
