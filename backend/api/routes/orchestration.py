"""
Matadora Core — Phase 5: Orchestration
API routes for pipeline execution and semantic routing.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.agents.base_agent import AgentMessage
from backend.api.dependencies import CurrentUser, Registry
from backend.orchestration.pipeline import MatadoraPipeline, PipelineMode
from backend.orchestration.router import SemanticRouter
from backend.services import memory

router = APIRouter(prefix="/orchestration", tags=["orchestration"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    session_id:         str
    content:            str
    mode:               PipelineMode = PipelineMode.SINGLE
    critic_iterations:  int | None   = Field(None, ge=1, le=5)
    round_robin_rounds: int | None   = Field(None, ge=1, le=5)


class MessageOut(BaseModel):
    id:           str
    session_id:   str
    scientist_id: str | None
    role:         str
    content:      str
    metadata:     dict[str, Any]
    parent_id:    str | None
    created_at:   str


class RouteRequest(BaseModel):
    query:               str
    top_k:               int   = Field(3, ge=1, le=5)
    similarity_threshold: float = Field(0.70, ge=0.0, le=1.0)


class RouteResponse(BaseModel):
    scientists:  list[str]
    similarities: list[float]
    source:      str


class RunResponse(BaseModel):
    session_id:  str
    mode:        str
    routed_to:   list[str]
    messages:    list[MessageOut]
    metadata:    dict[str, Any]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _msg_out(msg: AgentMessage) -> MessageOut:
    return MessageOut(
        id=msg.id,
        session_id=msg.session_id,
        scientist_id=msg.scientist_id,
        role=msg.role.value,
        content=msg.content,
        metadata=msg.metadata,
        parent_id=msg.parent_id,
        created_at=msg.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/run",
    response_model=RunResponse,
    summary="Run a multi-agent pipeline on a session",
)
async def run_pipeline(
    body: RunRequest,
    _: CurrentUser,
    registry: Registry,
) -> RunResponse:
    """
    Execute a full multi-agent pipeline.

    Modes
    -----
    - **single**      — semantic routing to best scientist, one response.
    - **panel**       — top-3 domain experts respond in parallel, Athena synthesises.
    - **critic_loop** — Prometheus proposes → Socrates critiques → revise N times → Athena decides.
    - **round_robin** — routed scientists discuss in N rounds.
    """
    session = await memory.get_session(body.session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    if session.status not in ("open", "paused"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active.")

    pipeline = MatadoraPipeline(
        registry,
        critic_iterations=body.critic_iterations or 2,
        round_robin_rounds=body.round_robin_rounds or 2,
    )

    result = await pipeline.process(
        session_id=body.session_id,
        user_input=body.content,
        mode=body.mode,
        critic_iterations=body.critic_iterations,
        round_robin_rounds=body.round_robin_rounds,
    )

    return RunResponse(
        session_id=result.session_id,
        mode=result.mode.value,
        routed_to=result.routed_to,
        messages=[_msg_out(m) for m in result.messages],
        metadata=result.metadata,
    )


@router.post(
    "/route",
    response_model=RouteResponse,
    summary="Semantically route a query to the best scientists (dry-run, no LLM calls)",
)
async def route_query(
    body: RouteRequest,
    _: CurrentUser,
    registry: Registry,
) -> RouteResponse:
    """
    Returns which scientists would be selected for the query without running them.
    Useful for previewing routing decisions.
    """
    semantic_router = SemanticRouter(
        registry,
        top_k=body.top_k,
        similarity_threshold=body.similarity_threshold,
    )
    route = await semantic_router.route(body.query)

    return RouteResponse(
        scientists=[s.name for s in route.scientists],
        similarities=route.similarities,
        source=route.source,
    )


@router.get(
    "/modes",
    response_model=list[dict],
    summary="List all available pipeline modes with descriptions",
)
async def list_modes(_: CurrentUser) -> list[dict]:
    return [
        {
            "mode":        PipelineMode.SINGLE,
            "description": "Route to best scientist via pgvector similarity. Single response.",
            "scientists":  1,
        },
        {
            "mode":        PipelineMode.PANEL,
            "description": "Top-3 experts respond in parallel; Athena synthesises.",
            "scientists":  "3-4",
        },
        {
            "mode":        PipelineMode.CRITIC_LOOP,
            "description": "Iterative propose→critique→revise loop; Athena decides; Mnemosyne compresses.",
            "scientists":  4,
        },
        {
            "mode":        PipelineMode.ROUND_ROBIN,
            "description": "Routed scientists + critic discuss in N rounds.",
            "scientists":  "2-4",
        },
    ]
