"""
Matadora Core — Phase 3: API Layer
Approval queue endpoints — HITL gate for high-risk agent actions.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from supabase import acreate_client

from backend.api.dependencies import CurrentUser
from backend.services import memory

router = APIRouter(prefix="/approvals", tags=["approvals"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ApprovalResponse(BaseModel):
    id:          str
    session_id:  str
    proposed_by: str | None
    action_type: str
    payload:     dict[str, Any]
    status:      str
    reviewed_by: str | None
    review_note: str | None
    expires_at:  str | None
    created_at:  str
    reviewed_at: str | None


class ReviewRequest(BaseModel):
    decision:    str          # "approved" | "rejected"
    review_note: str | None = None
    reviewed_by: str | None = None   # scientist id or user id


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_response(row: dict[str, Any]) -> ApprovalResponse:
    return ApprovalResponse(
        id=row["id"],
        session_id=row["session_id"],
        proposed_by=row.get("proposed_by"),
        action_type=row["action_type"],
        payload=row.get("payload", {}),
        status=row["status"],
        reviewed_by=row.get("reviewed_by"),
        review_note=row.get("review_note"),
        expires_at=row.get("expires_at"),
        created_at=row["created_at"],
        reviewed_at=row.get("reviewed_at"),
    )


async def _get_supabase():
    return await acreate_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=list[ApprovalResponse],
    summary="List pending approval items (optionally filtered by session)",
)
async def list_pending(
    _: CurrentUser,
    session_id: str | None = Query(None),
) -> list[ApprovalResponse]:
    rows = await memory.get_pending_approvals(session_id=session_id)
    return [_row_to_response(r) for r in rows]


@router.get(
    "/{approval_id}",
    response_model=ApprovalResponse,
    summary="Get a single approval item",
)
async def get_approval(
    approval_id: str,
    _: CurrentUser,
) -> ApprovalResponse:
    client = await _get_supabase()
    res = await (
        client.table("approval_queue")
        .select("*")
        .eq("id", approval_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval item not found.")
    return _row_to_response(res.data[0])


@router.patch(
    "/{approval_id}",
    response_model=ApprovalResponse,
    summary="Approve or reject a queued action",
)
async def review_approval(
    approval_id: str,
    body: ReviewRequest,
    current_user: CurrentUser,
) -> ApprovalResponse:
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Decision must be 'approved' or 'rejected'.",
        )

    client = await _get_supabase()

    res = await (
        client.table("approval_queue")
        .select("status")
        .eq("id", approval_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval item not found.")
    if res.data[0]["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Item is already '{res.data[0]['status']}' and cannot be reviewed again.",
        )

    update_payload: dict[str, Any] = {
        "status":      body.decision,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_by": body.reviewed_by or current_user.get("sub"),
    }
    if body.review_note:
        update_payload["review_note"] = body.review_note

    updated = await (
        client.table("approval_queue")
        .update(update_payload)
        .eq("id", approval_id)
        .execute()
    )
    return _row_to_response(updated.data[0])
