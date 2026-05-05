"""
Matadora Core — Phase 5: Orchestration
WorkflowEngine: runs multiple scientist agents in sequential, parallel,
or round-robin patterns.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Sequence

from backend.agents.base_agent import AgentMessage, MessageRole
from backend.agents.scientist_configs import OpenAIScientist
from backend.services import memory


# ---------------------------------------------------------------------------
# Enums & result types
# ---------------------------------------------------------------------------

class WorkflowMode(str, Enum):
    SEQUENTIAL   = "sequential"   # one by one, each sees the previous response
    PARALLEL     = "parallel"     # all fire simultaneously, responses independent
    ROUND_ROBIN  = "round_robin"  # N rounds of discussion between scientists


@dataclass
class WorkflowResult:
    mode:      WorkflowMode
    session_id: str
    responses: list[AgentMessage] = field(default_factory=list)

    @property
    def last(self) -> AgentMessage | None:
        return self.responses[-1] if self.responses else None

    def summary_text(self) -> str:
        return "\n\n".join(
            f"[{r.metadata.get('scientist', 'Unknown')}]\n{r.content}"
            for r in self.responses
        )


# ---------------------------------------------------------------------------
# WorkflowEngine
# ---------------------------------------------------------------------------

class WorkflowEngine:
    """
    Runs multi-scientist workflows.

    Usage
    -----
    engine = WorkflowEngine(registry)
    result = await engine.run(
        mode=WorkflowMode.SEQUENTIAL,
        scientists=[...],
        session_id="...",
        user_message=...,
        history=[...],
        persist=True,
    )
    """

    def __init__(self, registry=None) -> None:
        self._registry = registry

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def run(
        self,
        mode: WorkflowMode,
        scientists: Sequence[OpenAIScientist],
        session_id: str,
        user_message: AgentMessage,
        history: list[AgentMessage],
        *,
        persist: bool = True,
        rounds: int = 2,          # only used by ROUND_ROBIN
    ) -> WorkflowResult:
        result = WorkflowResult(mode=mode, session_id=session_id)

        if mode == WorkflowMode.SEQUENTIAL:
            result.responses = await self._sequential(
                scientists, session_id, user_message, history, persist=persist
            )
        elif mode == WorkflowMode.PARALLEL:
            result.responses = await self._parallel(
                scientists, session_id, user_message, history, persist=persist
            )
        elif mode == WorkflowMode.ROUND_ROBIN:
            result.responses = await self._round_robin(
                scientists, session_id, user_message, history,
                rounds=rounds, persist=persist
            )

        return result

    # ------------------------------------------------------------------
    # Sequential: A → B (B sees A's response in context)
    # ------------------------------------------------------------------

    async def _sequential(
        self,
        scientists: Sequence[OpenAIScientist],
        session_id: str,
        user_message: AgentMessage,
        history: list[AgentMessage],
        *,
        persist: bool,
    ) -> list[AgentMessage]:
        responses: list[AgentMessage] = []
        rolling_history = list(history) + [user_message]

        for scientist in scientists:
            resp = await scientist.run(session_id, rolling_history, user_message)
            resp.metadata["scientist"] = scientist.name
            resp.metadata["workflow"]  = WorkflowMode.SEQUENTIAL

            if persist:
                await memory.save_message(resp)

            responses.append(resp)
            rolling_history.append(resp)

        return responses

    # ------------------------------------------------------------------
    # Parallel: all scientists see the same context simultaneously
    # ------------------------------------------------------------------

    async def _parallel(
        self,
        scientists: Sequence[OpenAIScientist],
        session_id: str,
        user_message: AgentMessage,
        history: list[AgentMessage],
        *,
        persist: bool,
    ) -> list[AgentMessage]:
        base_history = list(history) + [user_message]

        async def call(scientist: OpenAIScientist) -> AgentMessage:
            resp = await scientist.run(session_id, base_history, user_message)
            resp.metadata["scientist"] = scientist.name
            resp.metadata["workflow"]  = WorkflowMode.PARALLEL
            return resp

        responses = list(await asyncio.gather(*[call(s) for s in scientists]))

        if persist:
            await asyncio.gather(*[memory.save_message(r) for r in responses])

        return responses

    # ------------------------------------------------------------------
    # Round-robin: scientists discuss in N rounds, each reading all prior
    # ------------------------------------------------------------------

    async def _round_robin(
        self,
        scientists: Sequence[OpenAIScientist],
        session_id: str,
        user_message: AgentMessage,
        history: list[AgentMessage],
        *,
        rounds: int,
        persist: bool,
    ) -> list[AgentMessage]:
        responses: list[AgentMessage] = []
        thread: list[AgentMessage] = list(history) + [user_message]

        for round_num in range(rounds):
            for scientist in scientists:
                # Inject round context into the prompt via a system note
                round_note = AgentMessage(
                    session_id=session_id,
                    role=MessageRole.SYSTEM,
                    content=(
                        f"[Round {round_num + 1}/{rounds}] "
                        f"You are now contributing as {scientist.name}. "
                        "Read all prior responses carefully before adding your perspective."
                    ),
                )
                resp = await scientist.run(session_id, thread, round_note)
                resp.metadata["scientist"] = scientist.name
                resp.metadata["workflow"]  = WorkflowMode.ROUND_ROBIN
                resp.metadata["round"]     = round_num + 1

                if persist:
                    await memory.save_message(resp)

                responses.append(resp)
                thread.append(resp)

        return responses
