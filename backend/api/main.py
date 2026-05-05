"""
Matadora Core — Phase 3: API Layer
FastAPI application entry point.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import approvals, messages, orchestration, scientists, sessions
from backend.api.routes.technologies import router as tech_router, wallet_router
from backend.api.dependencies import get_registry

load_dotenv()


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    registry = get_registry()
    app.state.registry = registry
    print(f"[Matadora] Registry ready: {registry}")
    yield
    print("[Matadora] Shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Matadora Core API",
    version="0.5.0",
    description=(
        "Multi-agent AI research platform. "
        "Scientists collaborate, reason, and propose actions — "
        "with a human-in-the-loop approval gate."
    ),
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

_allowed_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

_PREFIX = "/api/v1"

app.include_router(sessions.router,       prefix=_PREFIX)
app.include_router(messages.router,       prefix=_PREFIX)
app.include_router(scientists.router,     prefix=_PREFIX)
app.include_router(approvals.router,      prefix=_PREFIX)
app.include_router(orchestration.router,  prefix=_PREFIX)
app.include_router(tech_router,           prefix=_PREFIX)
app.include_router(wallet_router,         prefix=_PREFIX)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "version": app.version}
