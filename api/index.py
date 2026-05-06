import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import approvals, messages, orchestration, scientists, sessions
from backend.api.routes.technologies import router as tech_router, wallet_router

_allowed_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")

app = FastAPI(title="Matadora Core API", version="0.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_PREFIX = "/api/v1"
app.include_router(sessions.router,       prefix=_PREFIX)
app.include_router(messages.router,       prefix=_PREFIX)
app.include_router(scientists.router,     prefix=_PREFIX)
app.include_router(approvals.router,      prefix=_PREFIX)
app.include_router(orchestration.router,  prefix=_PREFIX)
app.include_router(tech_router,           prefix=_PREFIX)
app.include_router(wallet_router,         prefix=_PREFIX)

@app.get("/health")
def health():
    return {"status": "ok", "version": "0.5.0"}

@app.get("/_debug")
def debug_info():
    import traceback
    result = {"env_keys": list(os.environ.keys()), "has_groq": "GROQ_API_KEY" in os.environ}
    try:
        from backend.api.dependencies import get_registry
        reg = get_registry()
        result["registry"] = len(list(reg.all()))
    except Exception:
        result["registry_error"] = traceback.format_exc()
    return result
