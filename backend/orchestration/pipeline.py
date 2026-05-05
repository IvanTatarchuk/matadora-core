"""
Matadora Core — Phase 5: Orchestration
MatadoraPipeline: high-level entry point that combines router + workflow engine
+ critic loop into a single cohesive processing unit.

Execution modes
---------------
single       — route to best scientist, single response
panel        — route to top-3 + lead, run in parallel then synthesize
critic_loop  — full propose → critique → revise → decide loop
round_robin  — N rounds of discussion between routed scientists + critic
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from backend.agents.base_agent import AgentMessage, MessageRole
from backend.agents.scientist_configs import ScientistRegistry
from backend.orchestration.critic_loop import CriticLoop, CriticLoopResult
from backend.orchestration.router import SemanticRouter
from backend.orchestration.workflow import WorkflowEngine, WorkflowMode, WorkflowResult
from backend.services import memory


# ---------------------------------------------------------------------------
# Pipeline mode
# ---------------------------------------------------------------------------

class PipelineMode(str, Enum):
    SINGLE      = "single"
    PANEL       = "panel"
    CRITIC_LOOP = "critic_loop"
    ROUND_ROBIN = "round_robin"


# ---------------------------------------------------------------------------
# Pipeline result
# ---------------------------------------------------------------------------

@dataclass
class PipelineResult:
    session_id:   str
    mode:         PipelineMode
    messages:     list[AgentMessage]          = field(default_factory=list)
    critic_result: CriticLoopResult | None    = None
    workflow_result: WorkflowResult | None    = None
    routed_to:    list[str]                   = field(default_factory=list)
    metadata:     dict[str, Any]              = field(default_factory=dict)

    @property
    def final_content(self) -> str:
        if self.messages:
            return self.messages[-1].content
        return ""


# ---------------------------------------------------------------------------
# MatadoraPipeline
# ---------------------------------------------------------------------------

class MatadoraPipeline:
    """
    Unified orchestration façade.

    Parameters
    ----------
    registry          : ScientistRegistry (all five scientists).
    critic_iterations : Default iterations for critic_loop mode.
    round_robin_rounds: Default rounds for round_robin mode.
    persist           : Whether to save all intermediate messages to DB.
    """

    def __init__(
        self,
        registry: ScientistRegistry,
        *,
        critic_iterations:   int  = 2,
        round_robin_rounds:  int  = 2,
        persist:             bool = True,
    ) -> None:
        self._registry = registry
        self._router   = SemanticRouter(registry)
        self._engine   = WorkflowEngine(registry)
        self._critic   = CriticLoop(registry)
        self._critic_iterations  = critic_iterations
        self._round_robin_rounds = round_robin_rounds
        self._persist  = persist

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def process(
        self,
        session_id: str,
        user_input: str,
        mode: PipelineMode = PipelineMode.SINGLE,
        *,
        critic_iterations:  int | None = None,
        round_robin_rounds: int | None = None,
    ) -> PipelineResult:
        """
        Process a user message through the selected pipeline mode.

        Parameters
        ----------
        session_id         : Active Supabase session UUID.
        user_input         : The user's question or task description.
        mode               : PipelineMode (single / panel / critic_loop / round_robin).
        critic_iterations  : Override default for critic_loop mode.
        round_robin_rounds : Override default for round_robin mode.

        Returns
        -------
        PipelineResult with all generated messages.
        """
        history = await memory.get_session_history(session_id, limit=50)

        user_msg = AgentMessage(
            session_id=session_id,
            role=MessageRole.USER,
            content=user_input,
        )
        if self._persist:
            await memory.save_message(user_msg)

        result = PipelineResult(session_id=session_id, mode=mode)

        if mode == PipelineMode.SINGLE:
            await self._run_single(result, session_id, user_msg, history)

        elif mode == PipelineMode.PANEL:
            await self._run_panel(result, session_id, user_msg, history)

        elif mode == PipelineMode.CRITIC_LOOP:
            n = critic_iterations or self._critic_iterations
            await self._run_critic_loop(result, session_id, user_input, history, n)

        elif mode == PipelineMode.ROUND_ROBIN:
            n = round_robin_rounds or self._round_robin_rounds
            await self._run_round_robin(result, session_id, user_msg, history, n)

        return result

    # ------------------------------------------------------------------
    # Mode implementations
    # ------------------------------------------------------------------

    async def _run_single(
        self,
        result:    PipelineResult,
        session_id: str,
        user_msg:  AgentMessage,
        history:   list[AgentMessage],
    ) -> None:
        route = await self._router.route(user_msg.content, top_k=1)
        scientist = route.primary
        result.routed_to = [scientist.name]
        result.metadata["route_source"] = route.source

        resp = await scientist.run(session_id, history + [user_msg], user_msg)
        resp.metadata["scientist"] = scientist.name
        resp.metadata["pipeline"]  = PipelineMode.SINGLE

        if self._persist:
            await memory.save_message(resp)

        result.messages = [resp]

    async def _run_panel(
        self,
        result:    PipelineResult,
        session_id: str,
        user_msg:  AgentMessage,
        history:   list[AgentMessage],
    ) -> None:
        # Route to top-3 domain experts + always include the lead (Athena)
        panel = await self._router.route_multi(
            user_msg.content,
            required_roles=["lead"],
        )
        result.routed_to = [s.name for s in panel]
        result.metadata["panel_size"] = len(panel)

        # All experts respond in parallel, then Athena synthesises
        experts  = [s for s in panel if s.role.value != "lead"]
        leads    = [s for s in panel if s.role.value == "lead"]

        workflow = await self._engine.run(
            mode=WorkflowMode.PARALLEL,
            scientists=experts,
            session_id=session_id,
            user_message=user_msg,
            history=history,
            persist=self._persist,
        )
        result.workflow_result = workflow

        # Synthesise: Athena reads all expert responses
        if leads:
            synthesis_ctx = list(history) + [user_msg] + workflow.responses
            for lead in leads:
                synthesis_prompt = AgentMessage(
                    session_id=session_id,
                    role=MessageRole.USER,
                    content=(
                        "You have just received the panel's independent responses. "
                        "Synthesise them into a single authoritative answer, resolving "
                        "any contradictions and highlighting the most important insights."
                    ),
                )
                synthesis = await lead.run(session_id, synthesis_ctx, synthesis_prompt)
                synthesis.metadata["scientist"] = lead.name
                synthesis.metadata["pipeline"]  = PipelineMode.PANEL
                synthesis.metadata["role"]      = "synthesis"

                if self._persist:
                    await memory.save_message(synthesis)

                workflow.responses.append(synthesis)

        result.messages = workflow.responses

    async def _run_critic_loop(
        self,
        result:     PipelineResult,
        session_id: str,
        question:   str,
        history:    list[AgentMessage],
        iterations: int,
    ) -> None:
        loop_result = await self._critic.run(
            session_id=session_id,
            question=question,
            history=history,
            iterations=iterations,
            persist=self._persist,
        )
        result.critic_result = loop_result
        result.messages      = loop_result.transcript
        result.routed_to     = [
            self._critic._researcher,
            self._critic._critic,
            self._critic._lead,
            self._critic._synthesizer,
        ]

    async def _run_round_robin(
        self,
        result:    PipelineResult,
        session_id: str,
        user_msg:  AgentMessage,
        history:   list[AgentMessage],
        rounds:    int,
    ) -> None:
        # Route to 3 scientists + always include critic role
        panel = await self._router.route_multi(
            user_msg.content,
            required_roles=["critic"],
        )
        result.routed_to = [s.name for s in panel]

        workflow = await self._engine.run(
            mode=WorkflowMode.ROUND_ROBIN,
            scientists=panel,
            session_id=session_id,
            user_message=user_msg,
            history=history,
            rounds=rounds,
            persist=self._persist,
        )
        result.workflow_result = workflow
        result.messages        = workflow.responses
