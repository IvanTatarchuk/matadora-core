"""
Matadora Core — Phase 3: API Layer
Session endpoints.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from backend.api.dependencies import CurrentUser
from backend.services import memory

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    title:        str             = "Untitled Session"
    initiated_by: str | None      = None
    context:      dict[str, Any]  = {}


class SessionResponse(BaseModel):
    id:           str
    title:        str
    status:       str
    initiated_by: str | None
    context:      dict[str, Any]
    summary:      str | None
    created_at:   str
    updated_at:   str
    closed_at:    str | None


class UpdateSummaryRequest(BaseModel):
    summary: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_response(rec: memory.SessionRecord) -> SessionResponse:
    return SessionResponse(
        id=rec.id,
        title=rec.title,
        status=rec.status,
        initiated_by=rec.initiated_by,
        context=rec.context,
        summary=rec.summary,
        created_at=rec.created_at.isoformat(),
        updated_at=rec.updated_at.isoformat(),
        closed_at=rec.closed_at.isoformat() if rec.closed_at else None,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new session",
)
async def create_session(
    body: CreateSessionRequest,
    _: CurrentUser,
) -> SessionResponse:
    rec = await memory.create_session(
        title=body.title,
        initiated_by=body.initiated_by,
        context=body.context,
    )
    return _to_response(rec)


@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Get a session by ID",
)
async def get_session(
    session_id: str,
    _: CurrentUser,
) -> SessionResponse:
    rec = await memory.get_session(session_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return _to_response(rec)


@router.patch(
    "/{session_id}/close",
    response_model=SessionResponse,
    summary="Close a session",
)
async def close_session(
    session_id: str,
    _: CurrentUser,
) -> SessionResponse:
    rec = await memory.close_session(session_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return _to_response(rec)


@router.patch(
    "/{session_id}/summary",
    response_model=SessionResponse,
    summary="Update session summary (and regenerate its embedding)",
)
async def update_summary(
    session_id: str,
    body: UpdateSummaryRequest,
    _: CurrentUser,
) -> SessionResponse:
    rec = await memory.get_session(session_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    await memory.update_session_summary(session_id, body.summary)
    updated = await memory.get_session(session_id)
    return _to_response(updated)
