"""
Matadora Core — Phase 3: API Layer
FastAPI dependencies: Supabase JWT auth + scientist registry injection.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.agents.scientist_configs import ScientistRegistry, build_default_registry

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict:
    """
    Verify a Supabase-issued JWT.

    The token is signed with SUPABASE_JWT_SECRET (HS256).
    Returns the decoded payload (contains `sub`, `email`, `role`, etc.).
    """
    secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET is not configured.",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired.")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    return payload


CurrentUser = Annotated[dict, Depends(get_current_user)]

# ---------------------------------------------------------------------------
# Scientist registry (singleton, built once at startup)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _registry_singleton() -> ScientistRegistry:
    return build_default_registry()


def get_registry() -> ScientistRegistry:
    return _registry_singleton()


Registry = Annotated[ScientistRegistry, Depends(get_registry)]
