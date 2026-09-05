"""Key/value user settings, mirrored from the browser's local storage.

Local storage is authoritative for the live UI; this exists so a cleared browser
or a second device inherits the voice and rate the user already chose.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import select

from app.deps import SessionDep
from app.models.db_models import UserSettings

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsPayload(BaseModel):
    values: dict[str, str]


@router.get("", response_model=dict[str, str])
def get_settings(session: SessionDep) -> dict[str, str]:
    return {row.key: row.value for row in session.exec(select(UserSettings)).all()}


@router.put("", response_model=dict[str, str])
def put_settings(payload: SettingsPayload, session: SessionDep) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    for key, value in payload.values.items():
        row = session.get(UserSettings, key)
        if row is None:
            row = UserSettings(key=key, value=value, updated_at=now)
        else:
            row.value = value
            row.updated_at = now
        session.add(row)
    session.commit()
    return get_settings(session)
