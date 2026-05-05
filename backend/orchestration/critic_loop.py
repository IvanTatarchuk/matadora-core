"""
Matadora Core — Phase 5: Orchestration
CriticLoop: iterative propose → critique → revise → decide pipeline.

Flow
----
1. Researcher (Prometheus) produces initial proposal.
2. Critic      (Socrates)   challenges it.
3. Researcher revises based on critique.          ← repeats N times
4. Lead        (Athena)     makes final decision.
5. Synthesizer (Mnemosyne)  compresses to memory.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.agents.base_agent import AgentMessage, MessageRole
from backend.agents.scientist_configs import OpenAIScientist, ScientistRegistry
from backend.services import memory


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

@dataclass
class CriticLoopResult:
    session_id:   str
    question:     str
    iterations:   int
    transcript:   list[AgentMessage] = field(default_factory=list)
    decision:     AgentMessage | None = None
    summary:      AgentMessage | None = None

    @property
    def final_answer(self) -> str:
        if self.decision:
            return self.decision.content
        if self.transcript:
            return self.transcript[-1].content
        return ""


# ---------------------------------------------------------------------------
# CriticLoop
# ---------------------------------------------------------------------------

class CriticLoop:
    """
    Runs the iterative critic loop using named scientists from the registry.

    Parameters
    ----------
    registry   : ScientistRegistry with at least lead, researcher, critic, synthesizer.
    researcher : Name of the proposal scientist  (default: "Prometheus").
    critic     : Name of the critique scientist  (default: "Socrates").
    lead       : Name of the decision scientist  (default: "Athena").
    synthesizer: Name of the memory scientist    (default: "Mnemosyne").
    """

    def __init__(
        self,
        registry:    ScientistRegistry,
        *,
        researcher:  str = "Prometheus",
        critic:      str = "Socrates",
        lead:        str = "Athena",
        synthesizer: str = "Mnemosyne",
    ) -> None:
        self._registry    = registry
        self._researcher  = researcher
        self._critic      = critic
        self._lead        = lead
        self._synthesizer = synthesizer

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get(self, name: str) -> OpenAIScientist:
        scientist = self._registry.get(name)
        if not scientist:
            raise ValueError(f"Scientist '{name}' not found in registry.")
        return scientist

    async def _call(
        self,
        scientist: OpenAIScientist,
        session_id: str,
        thread: list[AgentMessage],
        prompt_content: str,
        *,
        persist: bool,
        tag: str,
    ) -> AgentMessage:
        prompt = AgentMessage(
            session_id=session_id,
            role=MessageRole.USER,
            content=prompt_content,
        )
        resp = await scientist.run(session_id, thread, prompt)
        resp.metadata["scientist"]   = scientist.name
        resp.metadata["critic_loop"] = tag

        if persist:
            await memory.save_message(resp)

        return resp

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def run(
        self,
        session_id: str,
        question: str,
        history: list[AgentMessage],
        *,
        iterations: int = 2,
        persist: bool = True,
    ) -> CriticLoopResult:
        """
        Execute the full critic loop.

        Parameters
        ----------
        session_id : Active session UUID.
        question   : The research question or task.
        history    : Prior messages in the session.
        iterations : Number of propose/critique/revise cycles.
        persist    : Whether to save all messages to DB.
        """
        result  = CriticLoopResult(session_id=session_id, question=question, iterations=iterations)
        thread  = list(history)

        researcher  = self._get(self._researcher)
        critic      = self._get(self._critic)
        lead        = self._get(self._lead)
        synthesizer = self._get(self._synthesizer)

        # ----------------------------------------------------------
        # Step 1: Initial proposal
        # ----------------------------------------------------------
        proposal = await self._call(
            researcher, session_id, thread,
            f"Produce an initial detailed proposal for the following question:\n\n{question}",
            persist=persist, tag="proposal_0",
        )
        result.transcript.append(proposal)
        thread.append(proposal)

        # ----------------------------------------------------------
        # Steps 2-3: Critique → Revise (N iterations)
        # ----------------------------------------------------------
        for i in range(iterations):
            critique = await self._call(
                critic, session_id, thread,
                (
                    f"[Iteration {i + 1}/{iterations}] "
                    "Critically evaluate the most recent proposal above. "
                    "Identify hidden assumptions, failure modes, and improvements."
                ),
                persist=persist, tag=f"critique_{i + 1}",
            )
            result.transcript.append(critique)
            thread.append(critique)

            revision = await self._call(
                researcher, session_id, thread,
                (
                    f"[Iteration {i + 1}/{iterations}] "
                    "Revise your proposal, directly addressing every point raised by the critic. "
                    "Be explicit about what changed and why."
                ),
                persist=persist, tag=f"revision_{i + 1}",
            )
            result.transcript.append(revision)
            thread.append(revision)

        # ----------------------------------------------------------
        # Step 4: Lead decision
        # ----------------------------------------------------------
        decision = await self._call(
            lead, session_id, thread,
            (
                "Review the full proposal-critique-revision thread above. "
                "Synthesise a final authoritative decision or recommendation. "
                "If any action requires human approval, state it explicitly with full details."
            ),
            persist=persist, tag="decision",
        )
        result.decision = decision
        result.transcript.append(decision)
        thread.append(decision)

        # ----------------------------------------------------------
        # Step 5: Memory compression
        # ----------------------------------------------------------
        summary_msg = await self._call(
            synthesizer, session_id, thread,
            (
                "Compress the entire critic loop above into a structured memory entry:\n"
                "1. Executive summary (≤150 words)\n"
                "2. Key decisions (bullets)\n"
                "3. Open questions\n"
                "4. Contradictions or risks noted"
            ),
            persist=persist, tag="memory_compression",
        )
        result.summary = summary_msg
        result.transcript.append(summary_msg)

        # Optionally persist the session summary vector
        if persist:
            await memory.update_session_summary(session_id, summary_msg.content)

        return result
