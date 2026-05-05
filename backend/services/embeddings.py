"""
Matadora Core — Phase 2: Agent Core
Embedding service: Nomic AI (nomic-embed-text-v1.5, 768-dim) via native httpx.
"""

from __future__ import annotations

import hashlib
import os
from typing import Sequence

import httpx


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EMBEDDING_MODEL = os.environ.get("NOMIC_EMBED_MODEL", "nomic-embed-text-v1.5")
EMBEDDING_DIM   = 768
CACHE_SIZE      = 512        # max unique texts kept in LRU cache
_NOMIC_URL      = "https://api-atlas.nomic.ai/v1/embedding/text"


# ---------------------------------------------------------------------------
# Internal HTTP helper
# ---------------------------------------------------------------------------

async def _nomic_embed(texts: list[str]) -> list[list[float]]:
    api_key = os.environ["NOMIC_API_KEY"]
    payload = {
        "model": EMBEDDING_MODEL,
        "texts": texts,
        "task_type": "search_document",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            _NOMIC_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
        resp.raise_for_status()
    return resp.json()["embeddings"]


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_key(text: str) -> str:
    """SHA-256 of the input text — used as LRU cache key."""
    return hashlib.sha256(text.encode()).hexdigest()


# Simple dict-based async cache (lru_cache doesn't work with async functions)
_embedding_cache: dict[str, list[float]] = {}


def _cache_get(text: str) -> list[float] | None:
    return _embedding_cache.get(_cache_key(text))


def _cache_set(text: str, vector: list[float]) -> None:
    if len(_embedding_cache) >= CACHE_SIZE:
        oldest_key = next(iter(_embedding_cache))
        del _embedding_cache[oldest_key]
    _embedding_cache[_cache_key(text)] = vector


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def embed_text(
    text: str,
    *,
    client: object | None = None,
    use_cache: bool = True,
) -> list[float]:
    """
    Embed a single text string.

    Parameters
    ----------
    text       : Input text (will be truncated to model max by the API if needed).
    client     : Ignored (kept for API compatibility).
    use_cache  : If True, checks in-process cache before calling the API.

    Returns
    -------
    768-dimensional float vector (Nomic AI nomic-embed-text-v1.5).
    """
    text = text.strip()
    if not text:
        return [0.0] * EMBEDDING_DIM

    if use_cache:
        cached = _cache_get(text)
        if cached is not None:
            return cached

    vector = (await _nomic_embed([text]))[0]

    if use_cache:
        _cache_set(text, vector)

    return vector


async def embed_batch(
    texts: Sequence[str],
    *,
    client: object | None = None,
    use_cache: bool = True,
    batch_size: int = 100,
) -> list[list[float]]:
    """
    Embed a list of texts efficiently.

    Texts already in the cache are skipped; only uncached texts are sent
    to the API (in batches of `batch_size`).

    Returns
    -------
    List of vectors in the same order as `texts`.
    """
    texts = [t.strip() for t in texts]
    results: list[list[float] | None] = [None] * len(texts)

    uncached_indices: list[int] = []
    for i, text in enumerate(texts):
        if not text:
            results[i] = [0.0] * EMBEDDING_DIM
            continue
        if use_cache:
            cached = _cache_get(text)
            if cached is not None:
                results[i] = cached
                continue
        uncached_indices.append(i)

    if uncached_indices:
        for chunk_start in range(0, len(uncached_indices), batch_size):
            chunk_indices = uncached_indices[chunk_start : chunk_start + batch_size]
            chunk_texts   = [texts[i] for i in chunk_indices]
            vectors = await _nomic_embed(chunk_texts)
            for offset, vector in enumerate(vectors):
                idx = chunk_indices[offset]
                results[idx] = vector
                if use_cache:
                    _cache_set(texts[idx], vector)

    return [r for r in results]


async def embed_scientist_domain(
    persona_description: str,
    domain_keywords: list[str],
    *,
    client: object | None = None,
) -> list[float]:
    """
    Create a domain embedding for a scientist by combining their
    persona description and domain keywords into one representative text.
    """
    combined = persona_description
    if domain_keywords:
        combined += " Keywords: " + ", ".join(domain_keywords) + "."
    return await embed_text(combined, client=client)


def clear_cache() -> None:
    """Flush the in-process embedding cache (useful in tests)."""
    _embedding_cache.clear()


def cache_stats() -> dict[str, int]:
    """Return current cache usage."""
    return {"size": len(_embedding_cache), "max_size": CACHE_SIZE}
