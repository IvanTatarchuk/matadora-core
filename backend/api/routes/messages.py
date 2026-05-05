"""
Matadora Core — Phase 3: API Layer
Message endpoints — history retrieval + SSE streaming agent responses.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.agents.base_agent import AgentMessage, MessageRole
from backend.agents.scientist_configs import ScientistRegistry
from backend.api.dependencies import CurrentUser, Registry
from backend.services import memory

router = APIRouter(prefix="/sessions/{session_id}/messages", tags=["messages"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class MessageResponse(BaseModel):
    id:           str
    session_id:   str
    scientist_id: str | None
    role:         str
    content:      str
    metadata:     dict[str, Any]
    parent_id:    str | None
    created_at:   str


class SendMessageRequest(BaseModel):
    content:      str
    scientist:    str | None = None   # target scientist name; None → Athena (lead)
    role:         str        = "user"


class SemanticSearchRequest(BaseModel):
    query:               str
    top_k:               int   = 5
    similarity_threshold: float = 0.75


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _msg_to_response(msg: AgentMessage | memory.MessageRecord) -> MessageResponse:
    if isinstance(msg, AgentMessage):
        return MessageResponse(
            id=msg.id,
            session_id=msg.session_id,
            scientist_id=msg.scientist_id,
            role=msg.role.value,
            content=msg.content,
            metadata=msg.metadata,
            parent_id=msg.parent_id,
            created_at=msg.created_at.isoformat(),
        )
    return MessageResponse(
        id=msg.id,
        session_id=msg.session_id,
        scientist_id=msg.scientist_id,
        role=msg.role,
        content=msg.content,
        metadata=msg.metadata,
        parent_id=msg.parent_id,
        created_at=msg.created_at.isoformat(),
    )


async def _sse_stream(generator: AsyncGenerator[str, None]) -> AsyncGenerator[bytes, None]:
    """Wrap string chunks into Server-Sent Events format."""
    async for chunk in generator:
        data = json.dumps({"delta": chunk})
        yield f"data: {data}\n\n".encode()
    yield b"data: [DONE]\n\n"


async def _stream_agent_response(
    scientist_name: str,
    registry: ScientistRegistry,
    session_id: str,
    history: list[AgentMessage],
    user_message: AgentMessage,
) -> AsyncGenerator[str, None]:
    """
    Call the scientist's OpenAI client in streaming mode and yield text deltas.
    Saves the full assembled response to the DB after the stream completes.
    """
    scientist = registry.get(scientist_name)
    if not scientist:
        yield f"[Error: scientist '{scientist_name}' not found]"
        return

    messages = scientist.build_context(history, user_message)
    full_content = ""

    stream = await scientist._client.chat.completions.create(
        model=scientist.config.model,
        messages=messages,
        temperature=scientist.config.temperature,
        max_tokens=scientist.config.max_tokens,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content or ""
        full_content += delta
        if delta:
            yield delta

    response_msg = AgentMessage(
        session_id=session_id,
        scientist_id=scientist.id,
        role=MessageRole.ASSISTANT,
        content=full_content,
        metadata={"model": scientist.config.model, "streamed": True},
        parent_id=user_message.id,
    )
    await memory.save_message(response_msg)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=list[MessageResponse],
    summary="Get session message history",
)
async def get_history(
    session_id: str,
    _: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
) -> list[MessageResponse]:
    session = await memory.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    history = await memory.get_session_history(session_id, limit=limit)
    return [_msg_to_response(m) for m in history]


@router.post(
    "",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message and get a non-streaming agent response",
)
async def send_message(
    session_id: str,
    body: SendMessageRequest,
    current_user: CurrentUser,
    registry: Registry,
) -> MessageResponse:
    session = await memory.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    if session.status not in ("open", "paused"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active.")

    user_msg = AgentMessage(
        session_id=session_id,
        role=MessageRole(body.role),
        content=body.content,
        metadata={"sender": current_user.get("sub")},
    )
    await memory.save_message(user_msg)

    history = await memory.get_session_history(session_id, limit=50)
    history = [m for m in history if m.id != user_msg.id]

    target = body.scientist or "Athena"
    scientist = registry.get(target)
    if not scientist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Scientist '{target}' not found.",
        )

    response = await scientist.run(session_id, history, user_msg)
    saved = await memory.save_message(response)
    return _msg_to_response(saved)


@router.post(
    "/stream",
    summary="Send a message and receive a streaming SSE agent response",
    response_class=StreamingResponse,
)
async def send_message_stream(
    session_id: str,
    body: SendMessageRequest,
    current_user: CurrentUser,
    registry: Registry,
) -> StreamingResponse:
    session = await memory.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    if session.status not in ("open", "paused"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active.")

    user_msg = AgentMessage(
        session_id=session_id,
        role=MessageRole(body.role),
        content=body.content,
        metadata={"sender": current_user.get("sub")},
    )
    await memory.save_message(user_msg)

    history = await memory.get_session_history(session_id, limit=50)
    history = [m for m in history if m.id != user_msg.id]

    target = body.scientist or "Athena"

    generator = _stream_agent_response(target, registry, session_id, history, user_msg)

    return StreamingResponse(
        _sse_stream(generator),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/search",
    response_model=list[dict],
    summary="Semantic similarity search within a session",
)
async def semantic_search(
    session_id: str,
    body: SemanticSearchRequest,
    _: CurrentUser,
) -> list[dict]:
    session = await memory.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    results = await memory.semantic_search(
        query=body.query,
        session_id=session_id,
        top_k=body.top_k,
        similarity_threshold=body.similarity_threshold,
    )
    return [
        {
            "similarity": r.similarity,
            "message":    _msg_to_response(r.message).model_dump(),
        }
        for r in results
    ]
