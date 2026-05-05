"""
Matadora Core — Seed default scientists into Supabase.

Usage:
    python -m backend.scripts.seed_scientists
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from dotenv import load_dotenv
load_dotenv()

from backend.agents.base_agent import AgentConfig, AgentRole, PersonaConfig
from backend.agents.scientist_configs import _SCIENTIST_DEFINITIONS
from backend.services.embeddings import embed_text
from supabase import acreate_client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_embed_text(defn: dict) -> str:
    """Compose a rich text string for embedding from a scientist definition."""
    p: PersonaConfig = defn["persona"]
    parts = [
        f"Name: {defn['name']}",
        f"Role: {defn['role'].value}",
        f"Description: {p.description}",
        f"Strengths: {', '.join(p.strengths)}",
        f"Keywords: {', '.join(p.domain_keywords)}",
        f"Style: {p.communication_style}",
    ]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def seed() -> None:
    url  = os.environ["SUPABASE_URL"]
    key  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = await acreate_client(url, key)

    # Delete ALL old scientists to start fresh
    print("  🗑   Removing old scientists...")
    await client.table("scientists_core").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    inserted = 0

    for defn in _SCIENTIST_DEFINITIONS:
        name = defn["name"]

        print(f"  🔢  Generating embedding for {name}…", end=" ", flush=True)
        embed_input = _build_embed_text(defn)
        vector = await embed_text(embed_input)
        print(f"done ({len(vector)}-dim)")

        row = {
            "id":        defn["id"],
            "name":      name,
            "role":      defn["role"].value,
            "persona":   defn["persona"].model_dump(),
            "embedding": vector,
            "is_active": True,
        }

        await client.table("scientists_core").insert(row).execute()
        print(f"  ✅  {name} ({defn['role'].value}) inserted")
        inserted += 1

    print(f"\nDone — {inserted} scientists seeded.")


if __name__ == "__main__":
    asyncio.run(seed())
