"""
Matadora Core — Phase 2: Agent Core
Memory service: Supabase read/write + semantic (RAG) retrieval via pgvector.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from supabase import AsyncClient, acreate_client

from backend.agents.base_agent import AgentMessage, MessageRole
from backend.services.embeddings import embed_text


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class SessionRecord:
    id:           str
    title:        str
    status:       str
    initiated_by: str | None
    context:      dict[str, Any]
    summary:      str | None
    created_at:   datetime
    updated_at:   datetime
    closed_at:    datetime | None


@dataclass
class MessageRecord:
    id:           str
    session_id:   str
    scientist_id: str | None
    role:         str
    content:      str
    metadata:     dict[str, Any]
    parent_id:    str | None
    created_at:   datetime


@dataclass
class ScientistRecord:
    id:         str
    name:       str
    role:       str
    persona:    dict[str, Any]
    is_active:  bool
    created_at: datetime


@dataclass
class SimilarMessage:
    message:    MessageRecord
    similarity: float


# ---------------------------------------------------------------------------
# Module-level client (lazy-init)
# ---------------------------------------------------------------------------

_supabase: AsyncClient | None = None


async def _get_client() -> AsyncClient:
    global _supabase
    if _supabase is None:
        _supabase = await acreate_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _supabase


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

async def create_session(
    title: str = "Untitled Session",
    initiated_by: str | None = None,
    context: dict[str, Any] | None = None,
) -> SessionRecord:
    """Create a new session and return its record."""
    client = await _get_client()
    payload: dict[str, Any] = {
        "title":        title,
        "status":       "open",
        "context":      context or {},
    }
    if initiated_by:
        payload["initiated_by"] = initiated_by

    res = await client.table("sessions").insert(payload).execute()
    return _parse_session(res.data[0])


async def get_session(session_id: str) -> SessionRecord | None:
    """Fetch a single session by ID."""
    client = await _get_client()
    res = await (
        client.table("sessions")
        .select("*")
        .eq("id", session_id)
        .limit(1)
        .execute()
    )
    return _parse_session(res.data[0]) if res.data else None


async def close_session(session_id: str) -> SessionRecord | None:
    """Mark a session as closed."""
    client = await _get_client()
    res = await (
        client.table("sessions")
        .update({"status": "closed", "closed_at": _now_iso()})
        .eq("id", session_id)
        .execute()
    )
    return _parse_session(res.data[0]) if res.data else None


async def update_session_summary(session_id: str, summary: str) -> None:
    """
    Persist a session summary and its semantic embedding.
    Called by the Mnemosyne synthesiser after distillation.
    """
    client   = await _get_client()
    vector   = await embed_text(summary)
    await (
        client.table("sessions")
        .update({"summary": summary, "summary_vector": vector})
        .eq("id", session_id)
        .execute()
    )


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

async def save_message(message: AgentMessage) -> MessageRecord:
    """
    Persist an AgentMessage to messages_log.
    Automatically generates and stores the content embedding.
    """
    client = await _get_client()
    vector = await embed_text(message.content)

    payload: dict[str, Any] = {
        "session_id":     message.session_id,
        "role":           message.role.value,
        "content":        message.content,
        "content_vector": vector,
        "metadata":       message.metadata,
    }
    if message.scientist_id:
        payload["scientist_id"] = message.scientist_id
    if message.parent_id:
        payload["parent_id"] = message.parent_id

    res = await client.table("messages_log").insert(payload).execute()
    return _parse_message(res.data[0])


async def get_session_history(
    session_id: str,
    limit: int = 50,
) -> list[AgentMessage]:
    """
    Return the last `limit` messages of a session, ordered oldest-first.
    """
    client = await _get_client()
    res = await (
        client.table("messages_log")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return [_record_to_agent_message(r) for r in res.data]


async def semantic_search(
    query: str,
    session_id: str | None = None,
    top_k: int = 5,
    similarity_threshold: float = 0.75,
) -> list[SimilarMessage]:
    """
    Retrieve the top-k semantically similar messages using pgvector cosine similarity.

    Optionally scoped to a specific session.

    Parameters
    ----------
    query                : Natural-language query.
    session_id           : If provided, restricts search to this session.
    top_k                : Number of results to return.
    similarity_threshold : Minimum cosine similarity (0–1) to include a result.

    Returns
    -------
    List of SimilarMessage sorted by descending similarity.
    """
    client = await _get_client()
    vector = await embed_text(query)

    rpc_params: dict[str, Any] = {
        "query_embedding":    vector,
        "match_count":        top_k,
        "similarity_threshold": similarity_threshold,
    }
    if session_id:
        rpc_params["filter_session_id"] = session_id

    res = await client.rpc("match_messages", rpc_params).execute()

    results: list[SimilarMessage] = []
    for row in res.data:
        record = MessageRecord(
            id=row["id"],
            session_id=row["session_id"],
            scientist_id=row.get("scientist_id"),
            role=row["role"],
            content=row["content"],
            metadata=row.get("metadata", {}),
            parent_id=row.get("parent_id"),
            created_at=_parse_dt(row["created_at"]),
        )
        results.append(SimilarMessage(message=record, similarity=row["similarity"]))

    return sorted(results, key=lambda x: x.similarity, reverse=True)


# ---------------------------------------------------------------------------
# Scientists
# ---------------------------------------------------------------------------

async def upsert_scientist(
    name: str,
    role: str,
    persona: dict[str, Any],
    embedding: list[float],
    scientist_id: str | None = None,
) -> ScientistRecord:
    """
    Insert or update a scientist record (syncs in-memory config to the DB).
    """
    client = await _get_client()
    payload: dict[str, Any] = {
        "name":      name,
        "role":      role,
        "persona":   persona,
        "embedding": embedding,
        "is_active": True,
    }
    if scientist_id:
        payload["id"] = scientist_id

    res = await (
        client.table("scientists_core")
        .upsert(payload, on_conflict="id")
        .execute()
    )
    return _parse_scientist(res.data[0])


async def get_scientist_by_name(name: str) -> ScientistRecord | None:
    """Fetch a scientist by name."""
    client = await _get_client()
    res = await (
        client.table("scientists_core")
        .select("*")
        .eq("name", name)
        .limit(1)
        .execute()
    )
    return _parse_scientist(res.data[0]) if res.data else None


# ---------------------------------------------------------------------------
# Approval queue
# ---------------------------------------------------------------------------

async def enqueue_approval(
    session_id: str,
    proposed_by: str,
    action_type: str,
    payload: dict[str, Any],
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Insert a new pending item into the approval queue."""
    client = await _get_client()
    record: dict[str, Any] = {
        "session_id":  session_id,
        "proposed_by": proposed_by,
        "action_type": action_type,
        "payload":     payload,
        "status":      "pending",
    }
    if expires_at:
        record["expires_at"] = expires_at

    res = await client.table("approval_queue").insert(record).execute()
    return res.data[0]


async def get_pending_approvals(session_id: str | None = None) -> list[dict[str, Any]]:
    """Return all pending items, optionally filtered by session."""
    client = await _get_client()
    q = client.table("approval_queue").select("*").eq("status", "pending")
    if session_id:
        q = q.eq("session_id", session_id)
    res = await q.order("created_at", desc=False).execute()
    return res.data


# ---------------------------------------------------------------------------
# Internal parsers
# ---------------------------------------------------------------------------

def _parse_session(row: dict[str, Any]) -> SessionRecord:
    return SessionRecord(
        id=row["id"],
        title=row["title"],
        status=row["status"],
        initiated_by=row.get("initiated_by"),
        context=row.get("context", {}),
        summary=row.get("summary"),
        created_at=_parse_dt(row["created_at"]),
        updated_at=_parse_dt(row["updated_at"]),
        closed_at=_parse_dt(row["closed_at"]) if row.get("closed_at") else None,
    )


def _parse_message(row: dict[str, Any]) -> MessageRecord:
    return MessageRecord(
        id=row["id"],
        session_id=row["session_id"],
        scientist_id=row.get("scientist_id"),
        role=row["role"],
        content=row["content"],
        metadata=row.get("metadata", {}),
        parent_id=row.get("parent_id"),
        created_at=_parse_dt(row["created_at"]),
    )


def _parse_scientist(row: dict[str, Any]) -> ScientistRecord:
    return ScientistRecord(
        id=row["id"],
        name=row["name"],
        role=row["role"],
        persona=row.get("persona", {}),
        is_active=row.get("is_active", True),
        created_at=_parse_dt(row["created_at"]),
    )


def _record_to_agent_message(row: dict[str, Any]) -> AgentMessage:
    return AgentMessage(
        id=row["id"],
        session_id=row["session_id"],
        scientist_id=row.get("scientist_id"),
        role=MessageRole(row["role"]),
        content=row["content"],
        metadata=row.get("metadata", {}),
        parent_id=row.get("parent_id"),
        created_at=_parse_dt(row["created_at"]),
    )


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
