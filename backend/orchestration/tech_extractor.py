"""
Matadora Core — Technology Extractor
After every research session, Feynman synthesises a Technology proposal
and Eleanor Hayes prices it in MTD. The result is saved to the marketplace.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from openai import AsyncOpenAI

from backend.agents.base_agent import AgentMessage
from backend.agents.scientist_configs import ScientistRegistry
from backend.services.embeddings import embed_text
from supabase import acreate_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_groq_client() -> AsyncOpenAI:
    base = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai")
    return AsyncOpenAI(
        base_url=f"{base.rstrip('/')}/v1",
        api_key=os.environ["GROQ_API_KEY"],
    )


def _conversation_text(messages: list[AgentMessage], registry: ScientistRegistry) -> str:
    """Build a readable transcript from AgentMessage list."""
    lines: list[str] = []
    for msg in messages:
        if msg.role.value == "user":
            lines.append(f"CLIENT: {msg.content}")
        else:
            scientist = next(
                (s for s in registry.all() if s.id == msg.scientist_id), None
            )
            name = scientist.name if scientist else "Scientist"
            lines.append(f"{name.upper()}: {msg.content[:800]}")
    return "\n\n".join(lines)


def _extract_json(text: str) -> dict:
    """Extract the first JSON object from a string."""
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("No JSON found in response")
    return json.loads(match.group())


# ---------------------------------------------------------------------------
# Core extractor
# ---------------------------------------------------------------------------

async def extract_technology(
    session_id: str,
    messages: list[AgentMessage],
    registry: ScientistRegistry,
    user_id: str | None = None,
) -> dict[str, Any] | None:
    """
    Extract a technology proposal from a completed research session.

    1. Feynman (synthesizer) identifies the core technology from the conversation.
    2. Eleanor Hayes (financial) assigns an MTD price and market analysis.
    3. The technology is saved as 'published' in the marketplace.

    Returns the saved technology row dict, or None if extraction fails.
    """
    if not messages:
        return None

    client = _make_groq_client()
    model  = os.environ.get("GROQ_CHAT_MODEL", "llama3-70b-8192")
    transcript = _conversation_text(messages, registry)

    # ── Step 1: Feynman extracts the technology ──────────────────────────────
    feynman_prompt = f"""You are Richard Feynman, Chief Synthesizer of Matadora Corporation.
You have just observed a research conversation between our scientists.
Your task: identify the SINGLE most important technology, invention, or breakthrough 
that emerged from this conversation, and describe it as a marketable product.

CONVERSATION:
{transcript}

Respond ONLY with a valid JSON object (no markdown, no explanation):
{{
  "title": "Short compelling technology name (max 8 words)",
  "description": "Detailed description of what this technology is, how it works, and its impact (2-4 sentences)",
  "summary": "One powerful sentence that sells this technology to a client",
  "category": "one of: energy | computing | biotech | materials | AI | space | general",
  "key_inventors": ["list of scientist names who contributed most"]
}}"""

    try:
        feynman_resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": feynman_prompt}],
            temperature=0.6,
            max_tokens=512,
        )
        tech_data = _extract_json(feynman_resp.choices[0].message.content or "")
    except Exception as exc:
        logger.warning("Feynman extraction failed: %s", exc)
        return None

    title       = str(tech_data.get("title", "Unnamed Technology"))
    description = str(tech_data.get("description", ""))
    summary     = str(tech_data.get("summary", ""))
    category    = str(tech_data.get("category", "general"))
    inventors   = tech_data.get("key_inventors", [])

    if not description:
        return None

    # ── Step 2: Eleanor prices it in MTD ────────────────────────────────────
    eleanor_prompt = f"""You are Eleanor Hayes, CFO of Matadora Corporation.
A new technology has just been proposed by our research team:

TITLE: {title}
DESCRIPTION: {description}
CATEGORY: {category}

Your task: assign a fair Matadora (MTD) price for this technology.
Price guidelines:
- Incremental improvement: 50-150 MTD
- Significant innovation:  150-500 MTD
- Breakthrough discovery:  500-2000 MTD
- Paradigm shift:          2000-10000 MTD

Respond ONLY with a valid JSON object:
{{
  "price_mtd": <number>,
  "tier": "incremental | significant | breakthrough | paradigm_shift",
  "market_size_estimate": "short estimate e.g. '$5B market'"
}}"""

    try:
        eleanor_resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": eleanor_prompt}],
            temperature=0.3,
            max_tokens=256,
        )
        price_data = _extract_json(eleanor_resp.choices[0].message.content or "")
        price_mtd  = float(price_data.get("price_mtd", 100))
    except Exception as exc:
        logger.warning("Eleanor pricing failed: %s", exc)
        price_mtd = 100.0
        price_data = {}

    # ── Step 3: Resolve inventor IDs ────────────────────────────────────────
    inventor_ids: list[str] = []
    for name in inventors:
        scientist = registry.get(name)
        if scientist:
            inventor_ids.append(scientist.id)

    # ── Step 4: Save to DB ───────────────────────────────────────────────────
    try:
        db_client = await acreate_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
        vector = await embed_text(f"{title}. {description}")

        row: dict[str, Any] = {
            "title":          title,
            "description":    description,
            "summary":        summary,
            "category":       category,
            "price_mtd":      price_mtd,
            "inventor_ids":   inventor_ids,
            "session_id":     session_id,
            "status":         "published",
            "content_vector": vector,
            "metadata": {
                "extracted_by":   "Feynman + Eleanor",
                "tier":           price_data.get("tier", ""),
                "market_size":    price_data.get("market_size_estimate", ""),
                "created_by_user": user_id,
            },
        }

        res = await db_client.table("technologies").insert(row).execute()
        technology = res.data[0]
        logger.info("Technology extracted and published: %s (%.0f MTD)", title, price_mtd)
        return technology

    except Exception as exc:
        logger.error("Failed to save technology: %s", exc)
        return None
