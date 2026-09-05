"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlmodel import Session

from app.content.loader import ContentCache, ContentStore
from app.db import get_session


def get_content_cache(request: Request) -> ContentCache:
    return request.app.state.content_cache


def get_store(cache: Annotated[ContentCache, Depends(get_content_cache)]) -> ContentStore:
    return cache.store


SessionDep = Annotated[Session, Depends(get_session)]
StoreDep = Annotated[ContentStore, Depends(get_store)]
CacheDep = Annotated[ContentCache, Depends(get_content_cache)]
