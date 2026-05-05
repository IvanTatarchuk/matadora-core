"""
Matadora Core — Technologies & Marketplace API
CRUD for technologies, marketplace listing, purchase via MTD.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from backend.api.dependencies import CurrentUser
from backend.services.embeddings import embed_text
from supabase import acreate_client

router = APIRouter(prefix="/technologies", tags=["technologies"])


# ---------------------------------------------------------------------------
# Supabase helper
# ---------------------------------------------------------------------------

async def _db():
    return await acreate_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TechnologyCreate(BaseModel):
    title:       str
    description: str
    summary:     str = ""
    category:    str = "general"
    price_mtd:   float = 0.0
    inventor_ids: list[str] = []
    session_id:  str | None = None


class TechnologyUpdate(BaseModel):
    title:       str | None = None
    description: str | None = None
    summary:     str | None = None
    category:    str | None = None
    price_mtd:   float | None = None
    status:      str | None = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_technologies(
    user: CurrentUser,
    status: str = "published",
    category: str | None = None,
    limit: int = 20,
    offset: int = 0,
):
    """List marketplace technologies."""
    db = await _db()
    q = db.table("technologies").select(
        "id,title,summary,category,status,price_mtd,inventor_ids,created_at"
    ).eq("status", status).order("created_at", desc=True).range(offset, offset + limit - 1)
    if category:
        q = q.eq("category", category)
    res = await q.execute()
    return res.data


@router.get("/mine")
async def my_purchases(user: CurrentUser):
    """List technologies purchased by the current user."""
    db = await _db()
    uid = user["sub"]
    res = await db.table("technology_purchases").select(
        "purchased_at, price_paid_mtd, technologies(id,title,summary,category)"
    ).eq("user_id", uid).execute()
    return res.data


@router.get("/{tech_id}")
async def get_technology(tech_id: str, user: CurrentUser):
    db = await _db()
    res = await db.table("technologies").select("*").eq("id", tech_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Technology not found")
    return res.data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_technology(body: TechnologyCreate, user: CurrentUser):
    """Create a new technology (draft). Scientists or users can propose."""
    db = await _db()
    vector = await embed_text(f"{body.title}. {body.description}")
    row: dict[str, Any] = {
        "title":          body.title,
        "description":    body.description,
        "summary":        body.summary,
        "category":       body.category,
        "price_mtd":      body.price_mtd,
        "inventor_ids":   body.inventor_ids,
        "status":         "draft",
        "content_vector": vector,
        "metadata":       {"created_by": user["sub"]},
    }
    if body.session_id:
        row["session_id"] = body.session_id
    res = await db.table("technologies").insert(row).execute()
    return res.data[0]


@router.patch("/{tech_id}")
async def update_technology(tech_id: str, body: TechnologyUpdate, user: CurrentUser):
    db = await _db()
    update: dict[str, Any] = {k: v for k, v in body.model_dump().items() if v is not None}
    if "title" in update or "description" in update:
        existing = (await db.table("technologies").select("title,description").eq("id", tech_id).single().execute()).data
        text = f"{update.get('title', existing['title'])}. {update.get('description', existing['description'])}"
        update["content_vector"] = await embed_text(text)
    res = await db.table("technologies").update(update).eq("id", tech_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Technology not found")
    return res.data[0]


@router.post("/{tech_id}/publish")
async def publish_technology(tech_id: str, user: CurrentUser):
    """Mark technology as published (available in marketplace)."""
    db = await _db()
    res = await db.table("technologies").update({"status": "published"}).eq("id", tech_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Technology not found")
    return res.data[0]


@router.post("/{tech_id}/buy")
async def buy_technology(tech_id: str, user: CurrentUser):
    """Purchase a technology using Matadora (MTD) tokens."""
    db = await _db()
    uid = user["sub"]
    res = await db.rpc("buy_technology", {"p_user_id": uid, "p_technology_id": tech_id}).execute()
    result = res.data
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Purchase failed"))
    return result


# ---------------------------------------------------------------------------
# Wallet routes
# ---------------------------------------------------------------------------

wallet_router = APIRouter(prefix="/wallet", tags=["wallet"])


@wallet_router.get("")
async def get_wallet(user: CurrentUser):
    """Get current user's MTD wallet balance."""
    db = await _db()
    uid = user["sub"]

    # Auto-create wallet if missing
    res = await db.table("matadora_wallets").select("*").eq("user_id", uid).execute()
    if not res.data:
        res = await db.table("matadora_wallets").insert({"user_id": uid, "balance": 100}).execute()
    return res.data[0]


@wallet_router.get("/transactions")
async def get_transactions(user: CurrentUser, limit: int = 20):
    """Get user's MTD transaction history."""
    db = await _db()
    uid = user["sub"]
    wallet = await db.table("matadora_wallets").select("id").eq("user_id", uid).single().execute()
    if not wallet.data:
        return []
    res = await db.table("matadora_transactions").select(
        "id,type,amount,description,created_at,technology_id"
    ).eq("wallet_id", wallet.data["id"]).order("created_at", desc=True).limit(limit).execute()
    return res.data
