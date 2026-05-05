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

    # Check existing scientists
    existing = await client.table("scientists_core").select("name").execute()
    existing_names = {r["name"] for r in existing.data}

    inserted = 0
    skipped  = 0

    for defn in _SCIENTIST_DEFINITIONS:
        name = defn["name"]

        if name in existing_names:
            print(f"  ⏭  {name} — already exists, skipping")
            skipped += 1
            continue

        config = AgentConfig(
            name=name,
            role=defn["role"],
            persona=defn["persona"],
            system_prompt=defn["system_prompt"],
            temperature=defn.get("temperature", 0.7),
        )

        print(f"  🔢  Generating embedding for {name}…", end=" ", flush=True)
        embed_input = _build_embed_text(defn)
        vector = await embed_text(embed_input)
        print(f"done ({len(vector)}-dim)")

        row = {
            "id":        config.id,
            "name":      config.name,
            "role":      config.role.value,
            "persona":   config.persona.model_dump(),
            "embedding": vector,
            "is_active": True,
        }

        await client.table("scientists_core").insert(row).execute()
        print(f"  ✅  {name} ({config.role.value}) inserted")
        inserted += 1

    print(f"\nDone — {inserted} inserted, {skipped} skipped.")


if __name__ == "__main__":
    asyncio.run(seed())
