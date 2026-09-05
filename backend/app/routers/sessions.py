"""Game session lifecycle: start, answer, finish.

One set of endpoints serves every game mode. Modes differ only in what they put
in `item_ref` and whether they send a self-graded `quality`.

Every write is idempotent on a client-supplied key, because answers are replayed
from the browser's outbox after the backend has been unreachable, and a replay
must not double-count a review.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.deps import SessionDep, StoreDep
from app.models.db_models import GameSession, GameSessionItem, ReviewLog, VocabProgress
from app.models.schemas import (
    AnswerIn,
    AnswerOut,
    SessionFinishOut,
    SessionItemOut,
    SessionOut,
    SessionStartIn,
    SessionStartOut,
)
from app.services import active_days, record_activity, streak_lengths
from app.srs.scheduler import SrsState, grade_from_correctness, next_state

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_session_row(session: SessionDep, session_id: int) -> GameSession:
    row = session.get(GameSession, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No game session {session_id}")
    return row


@router.post("/start", response_model=SessionStartOut)
def start_session(payload: SessionStartIn, session: SessionDep) -> SessionStartOut:
    if payload.client_session_key:
        existing = session.exec(
            select(GameSession)
            .where(GameSession.client_session_key == payload.client_session_key)
            .where(GameSession.completed_at.is_(None))  # type: ignore[union-attr]
        ).first()
        if existing is not None and existing.id is not None:
            answered = session.exec(
                select(GameSessionItem.item_ref).where(
                    GameSessionItem.session_id == existing.id
                )
            ).all()
            return SessionStartOut(
                session_id=existing.id,
                game_mode=existing.game_mode,
                lesson_id=existing.lesson_id,
                resumed=True,
                answered_item_refs=list(answered),
            )

    row = GameSession(
        game_mode=payload.game_mode,
        lesson_id=payload.lesson_id,
        client_session_key=payload.client_session_key,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    assert row.id is not None
    return SessionStartOut(
        session_id=row.id, game_mode=row.game_mode, lesson_id=row.lesson_id
    )


@router.post("/{session_id}/answer", response_model=AnswerOut)
def submit_answer(
    session_id: int, payload: AnswerIn, session: SessionDep, store: StoreDep
) -> AnswerOut:
    game = _get_session_row(session, session_id)

    if payload.client_answer_key:
        duplicate = session.exec(
            select(GameSessionItem)
            .where(GameSessionItem.session_id == session_id)
            .where(GameSessionItem.client_answer_key == payload.client_answer_key)
        ).first()
        if duplicate is not None:
            return AnswerOut(recorded=True, duplicate=True)

    session.add(
        GameSessionItem(
            session_id=session_id,
            item_ref=payload.item_ref,
            was_correct=payload.was_correct,
            response_time_ms=payload.response_time_ms,
            user_answer=payload.user_answer,
            client_answer_key=payload.client_answer_key,
        )
    )
    game.total_items += 1
    if payload.was_correct:
        game.correct_items += 1
    session.add(game)

    result = AnswerOut(recorded=True)

    # Only vocabulary and script characters carry scheduling state. Answers
    # about sentence patterns or passage spans are recorded for stats but do
    # not move any review schedule.
    is_srs_item = payload.item_ref in store.vocab or payload.item_ref in store.characters
    if is_srs_item:
        progress = session.exec(
            select(VocabProgress).where(VocabProgress.vocab_id == payload.item_ref)
        ).first()
        if progress is None:
            progress = VocabProgress(
                vocab_id=payload.item_ref,
                due_date=datetime.now(timezone.utc).date(),
            )
            session.add(progress)
            session.flush()

        quality = payload.quality
        if quality is None:
            quality = grade_from_correctness(
                payload.was_correct, response_time_ms=payload.response_time_ms
            )

        updated = next_state(
            SrsState(
                ease_factor=progress.ease_factor,
                interval_days=progress.interval_days,
                repetitions=progress.repetitions,
                due_date=progress.due_date,
            ),
            quality,
        )
        progress.ease_factor = updated.ease_factor
        progress.interval_days = updated.interval_days
        progress.repetitions = updated.repetitions
        progress.due_date = updated.due_date
        progress.last_reviewed_at = datetime.now(timezone.utc)
        progress.last_quality = quality
        progress.total_reviews += 1
        if payload.was_correct:
            progress.total_correct += 1
        session.add(progress)
        session.add(
            ReviewLog(
                vocab_id=payload.item_ref,
                quality=quality,
                game_mode=game.game_mode,
                response_time_ms=payload.response_time_ms,
            )
        )
        result = AnswerOut(
            recorded=True,
            srs_applied=True,
            next_due_date=updated.due_date,
            next_interval_days=updated.interval_days,
            ease_factor=updated.ease_factor,
        )

    session.commit()
    return result


@router.post("/{session_id}/finish", response_model=SessionFinishOut)
def finish_session(
    session_id: int,
    session: SessionDep,
    duration_seconds: int | None = Query(default=None, ge=0, le=86400),
) -> SessionFinishOut:
    game = _get_session_row(session, session_id)

    items = session.exec(
        select(GameSessionItem).where(GameSessionItem.session_id == session_id)
    ).all()
    total = len(items)
    correct = sum(1 for item in items if item.was_correct)

    now = datetime.now(timezone.utc)
    if duration_seconds is None:
        started = game.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        duration_seconds = max(0, int((now - started).total_seconds()))

    already_finished = game.completed_at is not None
    game.total_items = total
    game.correct_items = correct
    game.score = (correct / total) if total else None
    game.duration_seconds = duration_seconds
    game.completed_at = now
    session.add(game)
    session.commit()

    # Finishing the same session twice (a retried outbox flush) must not inflate
    # the day's totals.
    if not already_finished:
        record_activity(session, minutes=round(duration_seconds / 60), sessions=1)

    current_streak, _ = streak_lengths(active_days(session))
    return SessionFinishOut(
        session_id=session_id,
        score=game.score,
        total_items=total,
        correct_items=correct,
        duration_seconds=duration_seconds,
        streak_days=current_streak,
    )


@router.get("", response_model=list[SessionOut])
def list_sessions(
    session: SessionDep,
    limit: int = Query(default=20, ge=1, le=200),
    game_mode: str | None = None,
) -> list[SessionOut]:
    statement = select(GameSession).order_by(GameSession.started_at.desc())  # type: ignore[attr-defined]
    if game_mode:
        statement = statement.where(GameSession.game_mode == game_mode)
    rows = session.exec(statement.limit(limit)).all()
    return [
        SessionOut(
            id=row.id or 0,
            game_mode=row.game_mode,
            lesson_id=row.lesson_id,
            started_at=row.started_at,
            completed_at=row.completed_at,
            score=row.score,
            total_items=row.total_items,
            correct_items=row.correct_items,
            duration_seconds=row.duration_seconds,
        )
        for row in rows
    ]


@router.get("/{session_id}", response_model=SessionOut)
def get_session_detail(session_id: int, session: SessionDep) -> SessionOut:
    game = _get_session_row(session, session_id)
    items = session.exec(
        select(GameSessionItem)
        .where(GameSessionItem.session_id == session_id)
        .order_by(GameSessionItem.id)  # type: ignore[arg-type]
    ).all()
    return SessionOut(
        id=game.id or 0,
        game_mode=game.game_mode,
        lesson_id=game.lesson_id,
        started_at=game.started_at,
        completed_at=game.completed_at,
        score=game.score,
        total_items=game.total_items,
        correct_items=game.correct_items,
        duration_seconds=game.duration_seconds,
        items=[
            SessionItemOut(
                item_ref=item.item_ref,
                was_correct=item.was_correct,
                user_answer=item.user_answer,
                response_time_ms=item.response_time_ms,
                answered_at=item.answered_at,
            )
            for item in items
        ],
    )
