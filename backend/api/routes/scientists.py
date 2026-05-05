"""
Matadora Core — Phase 3: API Layer
Scientist registry endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from backend.api.dependencies import CurrentUser, Registry
from backend.services import embeddings, memory

router = APIRouter(prefix="/scientists", tags=["scientists"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class ScientistResponse(BaseModel):
    id:         str
    name:       str
    role:       str
    persona:    dict
    is_active:  bool
    created_at: str


class SyncResponse(BaseModel):
    synced: list[str]
    errors: list[str]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=list[ScientistResponse],
    summary="List all scientists from the in-memory registry",
)
async def list_scientists(
    registry: Registry,
    _: CurrentUser,
) -> list[ScientistResponse]:
    return [
        ScientistResponse(
            id=s.id,
            name=s.name,
            role=s.role.value,
            persona=s.config.persona.model_dump(),
            is_active=True,
            created_at="",
        )
        for s in registry.all()
    ]


@router.get(
    "/{name}",
    response_model=ScientistResponse,
    summary="Get a scientist by name",
)
async def get_scientist(
    name: str,
    registry: Registry,
    _: CurrentUser,
) -> ScientistResponse:
    scientist = registry.get(name)
    if not scientist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Scientist '{name}' not found.")
    return ScientistResponse(
        id=scientist.id,
        name=scientist.name,
        role=scientist.role.value,
        persona=scientist.config.persona.model_dump(),
        is_active=True,
        created_at="",
    )


@router.post(
    "/sync",
    response_model=SyncResponse,
    summary="Sync all in-memory scientists to the database (upsert with fresh embeddings)",
)
async def sync_scientists(
    registry: Registry,
    _: CurrentUser,
) -> SyncResponse:
    """
    For each scientist in the registry:
    1. Generate a domain embedding from persona description + keywords.
    2. Upsert the record into scientists_core.
    """
    synced: list[str] = []
    errors: list[str] = []

    for scientist in registry.all():
        try:
            persona = scientist.config.persona
            vector = await embeddings.embed_scientist_domain(
                persona_description=persona.description,
                domain_keywords=persona.domain_keywords,
            )
            await memory.upsert_scientist(
                name=scientist.name,
                role=scientist.role.value,
                persona=persona.model_dump(),
                embedding=vector,
                scientist_id=scientist.id,
            )
            synced.append(scientist.name)
        except Exception as exc:
            errors.append(f"{scientist.name}: {exc}")

    return SyncResponse(synced=synced, errors=errors)
