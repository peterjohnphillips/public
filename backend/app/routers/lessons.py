"""Lesson listing and detail."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.deps import SessionDep, StoreDep
from app.models.db_models import LessonProgress, VocabProgress
from app.models.schemas import ContentStatus, Lesson, LessonSummary, SkillType
from app.services import get_or_create_lesson_progress, mark_lesson_started, record_activity

router = APIRouter(prefix="/lessons", tags=["lessons"])


def _progress_map(session: SessionDep) -> dict[str, LessonProgress]:
    rows = session.exec(select(LessonProgress)).all()
    return {row.lesson_id: row for row in rows}


def _due_vocab_ids(session: SessionDep) -> set[str]:
    today = date.today()
    rows = session.exec(
        select(VocabProgress.vocab_id).where(VocabProgress.due_date <= today)
    ).all()
    return set(rows)


def _decorate(lesson: Lesson, progress: LessonProgress | None, due_ids: set[str]) -> dict:
    data = lesson.model_dump()
    data["progress_status"] = progress.status if progress else "not_started"
    data["times_practiced"] = progress.times_practiced if progress else 0
    data["due_vocab_count"] = sum(1 for item in lesson.vocab if item.id in due_ids)
    return data


@router.get("", response_model=list[LessonSummary])
def list_lessons(
    session: SessionDep,
    store: StoreDep,
    week: int | None = Query(default=None, ge=1, le=4),
    skill_type: SkillType | None = None,
    status: ContentStatus | None = None,
    has_audio: bool | None = None,
) -> list[LessonSummary]:
    progress = _progress_map(session)
    due_ids = _due_vocab_ids(session)

    results: list[LessonSummary] = []
    for lesson in store.lesson_list:
        if week is not None and lesson.week != week:
            continue
        if skill_type is not None and lesson.skill_type != skill_type:
            continue
        if status is not None and lesson.status != status:
            continue
        if has_audio is not None and lesson.has_audio_content != has_audio:
            continue
        results.append(
            LessonSummary.model_validate(_decorate(lesson, progress.get(lesson.id), due_ids))
        )
    return results


@router.get("/{lesson_id}", response_model=Lesson)
def get_lesson(lesson_id: str, session: SessionDep, store: StoreDep) -> Lesson:
    lesson = store.lessons.get(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"No lesson with id {lesson_id!r}")

    progress = mark_lesson_started(session, lesson_id)
    due_ids = _due_vocab_ids(session)
    return Lesson.model_validate(_decorate(lesson, progress, due_ids))


@router.post("/{lesson_id}/complete", response_model=LessonSummary)
def complete_lesson(
    lesson_id: str,
    session: SessionDep,
    store: StoreDep,
    minutes: int = Query(default=0, ge=0, le=600),
) -> LessonSummary:
    lesson = store.lessons.get(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"No lesson with id {lesson_id!r}")

    progress = get_or_create_lesson_progress(session, lesson_id)
    progress.status = "completed"
    progress.completed_at = datetime.now(timezone.utc)
    progress.times_practiced += 1
    if progress.first_started_at is None:
        progress.first_started_at = progress.completed_at
    session.add(progress)
    session.commit()
    session.refresh(progress)

    if minutes:
        record_activity(session, minutes=minutes)

    due_ids = _due_vocab_ids(session)
    return LessonSummary.model_validate(_decorate(lesson, progress, due_ids))
