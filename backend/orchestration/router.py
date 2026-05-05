"""
Matadora Core — Phase 5: Orchestration
SemanticRouter: selects the best scientist(s) for a query using pgvector
cosine similarity via the match_scientists Supabase RPC.
Falls back to the lead scientist when no good match is found.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from supabase import AsyncClient, acreate_client

from backend.agents.scientist_configs import OpenAIScientist, ScientistRegistry
from backend.services.embeddings import embed_text


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

@dataclass
class RouteResult:
    scientists:  list[OpenAIScientist]
    similarities: list[float]
    source:      str           # "semantic" | "fallback"

    @property
    def primary(self) -> OpenAIScientist:
        return self.scientists[0]


# ---------------------------------------------------------------------------
# SemanticRouter
# ---------------------------------------------------------------------------

class SemanticRouter:
    """
    Routes a query to the most domain-relevant scientists.

    Strategy
    --------
    1. Embed the query text.
    2. Call match_scientists RPC (pgvector cosine similarity).
    3. Look up each returned scientist by name in the registry.
    4. If no DB match passes the threshold → fallback to the lead scientist.

    Parameters
    ----------
    registry             : ScientistRegistry.
    fallback_name        : Name of the scientist to use when routing fails (default: "Athena").
    similarity_threshold : Minimum cosine similarity to accept a match (default: 0.70).
    top_k                : Maximum number of scientists to return (default: 3).
    """

    def __init__(
        self,
        registry: ScientistRegistry,
        *,
        fallback_name:        str   = "Athena",
        similarity_threshold: float = 0.70,
        top_k:                int   = 3,
    ) -> None:
        self._registry             = registry
        self._fallback_name        = fallback_name
        self._similarity_threshold = similarity_threshold
        self._top_k                = top_k
        self._client: AsyncClient | None = None

    async def _get_client(self) -> AsyncClient:
        if self._client is None:
            self._client = await acreate_client(
                os.environ["SUPABASE_URL"],
                os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            )
        return self._client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def route(
        self,
        query: str,
        *,
        top_k: int | None = None,
        similarity_threshold: float | None = None,
    ) -> RouteResult:
        """
        Return the best scientists for the given query.

        Parameters
        ----------
        query                : Natural-language input to route.
        top_k                : Override instance-level top_k.
        similarity_threshold : Override instance-level threshold.

        Returns
        -------
        RouteResult with ordered list of scientists (best match first).
        """
        k         = top_k or self._top_k
        threshold = similarity_threshold or self._similarity_threshold

        vector = await embed_text(query)
        client = await self._get_client()

        res = await client.rpc(
            "match_scientists",
            {
                "query_embedding":    vector,
                "match_count":        k,
                "similarity_threshold": threshold,
            },
        ).execute()

        matched: list[OpenAIScientist] = []
        sims:    list[float]           = []

        for row in res.data:
            s = self._registry.get(row["name"])
            if s:
                matched.append(s)
                sims.append(float(row["similarity"]))

        if matched:
            return RouteResult(scientists=matched, similarities=sims, source="semantic")

        # Fallback
        fallback = self._registry.get(self._fallback_name)
        if not fallback:
            fallback = self._registry.all()[0]

        return RouteResult(scientists=[fallback], similarities=[0.0], source="fallback")

    async def route_multi(
        self,
        query: str,
        required_roles: list[str] | None = None,
    ) -> list[OpenAIScientist]:
        """
        Route to best match + optionally guarantee certain roles are included.

        Example: always include the critic and synthesizer regardless of score.
        """
        base = await self.route(query)
        result = list(base.scientists)

        existing_roles = {s.role.value for s in result}

        if required_roles:
            for role in required_roles:
                if role not in existing_roles:
                    candidates = self._registry.get_by_role(role)  # type: ignore[arg-type]
                    if candidates:
                        result.append(candidates[0])
                        existing_roles.add(role)

        return result
