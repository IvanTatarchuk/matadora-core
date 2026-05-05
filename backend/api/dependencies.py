"""
Matadora Core — Phase 3: API Layer
FastAPI dependencies: Supabase JWT auth + scientist registry injection.
Supports both ES256 (new Supabase projects via JWKS) and HS256 (legacy).
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated

import httpx
import jwt
from jwt.algorithms import ECAlgorithm
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.agents.scientist_configs import ScientistRegistry, build_default_registry

# ---------------------------------------------------------------------------
# JWKS cache — fetched once per process
# ---------------------------------------------------------------------------

_jwks_cache: dict[str, object] = {}   # kid -> public key


async def _get_public_key(kid: str) -> object | None:
    """Fetch EC public key from Supabase JWKS endpoint (cached per kid)."""
    if kid in _jwks_cache:
        return _jwks_cache[kid]
    url = os.environ.get("SUPABASE_URL", "").rstrip("/") + "/auth/v1/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        for key_data in resp.json().get("keys", []):
            if key_data.get("kid") == kid:
                pub = ECAlgorithm.from_jwk(key_data)
                _jwks_cache[kid] = pub
                return pub
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict:
    """
    Verify a Supabase-issued JWT.
    Tries ES256 (JWKS) first, then HS256 (SUPABASE_JWT_SECRET) as fallback.
    Returns the decoded payload (contains `sub`, `email`, `role`, etc.).
    """
    token = credentials.credentials

    # --- Detect algorithm from header ---
    try:
        header = jwt.get_unverified_header(token)
    except jwt.DecodeError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    alg = header.get("alg", "HS256")

    try:
        if alg == "ES256":
            kid = header.get("kid", "")
            pub_key = await _get_public_key(kid)
            if pub_key is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Unable to fetch public key for token verification.",
                )
            payload = jwt.decode(token, pub_key, algorithms=["ES256"], audience="authenticated")
        else:
            secret = os.environ.get("SUPABASE_JWT_SECRET", "")
            payload = jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
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
