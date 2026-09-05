"""Vocabulary listing and the spaced-repetition due queue."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.deps import SessionDep, StoreDep
from app.models.db_models import VocabProgress
from app.models.schemas import (
    MasteryBucket,
    VocabCategory,
    VocabItemOut,
    VocabProgressOut,
)
from app.srs.scheduler import mastery_bucket

router = APIRouter(prefix="/vocab", tags=["vocab"])


def _to_progress_out(row: VocabProgress, today: date) -> VocabProgressOut:
    return VocabProgressOut(
        ease_factor=row.ease_factor,
        interval_days=row.interval_days,
        repetitions=row.repetitions,
        due_date=row.due_date,
        last_reviewed_at=row.last_reviewed_at,
        total_reviews=row.total_reviews,
        total_correct=row.total_correct,
        bucket=MasteryBucket(mastery_bucket(row.repetitions, row.interval_days)),
        is_due=row.due_date <= today,
    )


def _progress_rows(session: SessionDep) -> dict[str, VocabProgress]:
    return {row.vocab_id: row for row in session.exec(select(VocabProgress)).all()}


@router.get("", response_model=list[VocabItemOut])
def list_vocab(
    session: SessionDep,
    store: StoreDep,
    category: VocabCategory | None = None,
    lesson_id: str | None = None,
    introduced_week: int | None = Query(default=None, ge=1, le=4),
    bucket: MasteryBucket | None = None,
    limit: int = Query(default=1000, ge=1, le=5000),
) -> list[VocabItemOut]:
    today = date.today()
    rows = _progress_rows(session)

    results: list[VocabItemOut] = []
    for item in store.vocab_list:
        if category is not None and item.category != category:
            continue
        if lesson_id is not None and item.source_lesson_id != lesson_id:
            continue
        if introduced_week is not None and item.introduced_week != introduced_week:
            continue
        row = rows.get(item.id)
        progress = _to_progress_out(row, today) if row else None
        if bucket is not None and (progress is None or progress.bucket != bucket):
            continue
        results.append(VocabItemOut(**item.model_dump(), progress=progress))
        if len(results) >= limit:
            break
    return results


@router.get("/due", response_model=list[VocabItemOut])
def due_vocab(
    session: SessionDep,
    store: StoreDep,
    limit: int = Query(default=30, ge=1, le=500),
    category: VocabCategory | None = None,
    lesson_id: str | None = None,
) -> list[VocabItemOut]:
    """The review queue: due items, soonest-due first, hardest first among ties.

    Ordering by ease factor within a due date puts the words the user keeps
    failing at the front of the session, when attention is freshest.
    """
    today = date.today()
    rows = session.exec(
        select(VocabProgress)
        .where(VocabProgress.due_date <= today)
        .order_by(VocabProgress.due_date, VocabProgress.ease_factor)  # type: ignore[arg-type]
    ).all()

    results: list[VocabItemOut] = []
    for row in rows:
        item = store.vocab.get(row.vocab_id)
        if item is None:
            # Progress row for vocabulary that has since been removed from content.
            continue
        if category is not None and item.category != category:
            continue
        if lesson_id is not None and item.source_lesson_id != lesson_id:
            continue
        results.append(
            VocabItemOut(**item.model_dump(), progress=_to_progress_out(row, today))
        )
        if len(results) >= limit:
            break
    return results


@router.get("/{vocab_id:path}", response_model=VocabItemOut)
def get_vocab(vocab_id: str, session: SessionDep, store: StoreDep) -> VocabItemOut:
    item = store.vocab.get(vocab_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"No vocabulary item {vocab_id!r}")
    row = session.exec(
        select(VocabProgress).where(VocabProgress.vocab_id == vocab_id)
    ).first()
    progress = _to_progress_out(row, date.today()) if row else None
    return VocabItemOut(**item.model_dump(), progress=progress)
