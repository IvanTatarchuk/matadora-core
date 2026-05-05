"""
Matadora Core — Phase 2: Agent Core
Default scientist agent implementations and registry.
Backed by Groq (chat) via OpenAI-compatible API.
"""

from __future__ import annotations

import os
from typing import Any

from openai import AsyncOpenAI

from backend.agents.base_agent import (
    AgentConfig,
    AgentMessage,
    AgentRole,
    BaseScientist,
    MessageRole,
    PersonaConfig,
)


# ---------------------------------------------------------------------------
# OpenAI-backed scientist (shared mixin)
# ---------------------------------------------------------------------------

def _make_groq_client() -> AsyncOpenAI:
    base = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai")
    return AsyncOpenAI(
        base_url=f"{base.rstrip('/')}/v1",
        api_key=os.environ["GROQ_API_KEY"],
    )


class OpenAIScientist(BaseScientist):
    """
    Concrete scientist that calls Groq via the OpenAI-compatible API.
    All default scientists extend this class.
    """

    def __init__(self, config: AgentConfig, client: AsyncOpenAI | None = None) -> None:
        super().__init__(config)
        self._client = client or _make_groq_client()

    def build_system_prompt(self) -> str:
        p = self.config.persona
        lines = [
            f"You are {self.config.name}, a {self.config.role.value} scientist in the Matadora Core system.",
            f"Role: {p.description}",
        ]
        if p.strengths:
            lines.append("Your strengths: " + ", ".join(p.strengths) + ".")
        if p.constraints:
            lines.append("Always respect these constraints: " + "; ".join(p.constraints) + ".")
        if p.communication_style:
            lines.append(f"Communication style: {p.communication_style}.")
        lines.append("")
        lines.append(self.config.system_prompt)
        return "\n".join(lines)

    async def process(
        self,
        session_id: str,
        history: list[AgentMessage],
        new_message: AgentMessage,
    ) -> AgentMessage:
        messages = self.build_context(history, new_message)

        model = os.environ.get("GROQ_CHAT_MODEL", self.config.model)
        response = await self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=self.config.temperature,
            max_tokens=self.config.max_tokens,
        )

        choice = response.choices[0]
        return AgentMessage(
            session_id=session_id,
            scientist_id=self.id,
            role=MessageRole.ASSISTANT,
            content=choice.message.content or "",
            metadata={
                "model":             response.model,
                "prompt_tokens":     response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "finish_reason":     choice.finish_reason,
            },
            parent_id=new_message.id,
        )


# ---------------------------------------------------------------------------
# Default scientist definitions
# ---------------------------------------------------------------------------

_SCIENTIST_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "Athena",
        "role": AgentRole.LEAD,
        "persona": PersonaConfig(
            description="Lead coordinator who synthesises inputs from all scientists and drives the session toward a conclusion.",
            strengths=["strategic thinking", "cross-domain synthesis", "decision-making"],
            constraints=["never act without consulting at least one other scientist", "always produce an explicit decision or next step"],
            communication_style="authoritative but concise",
            domain_keywords=["coordination", "strategy", "synthesis", "decision"],
        ),
        "system_prompt": (
            "You orchestrate the Matadora research session. "
            "After reading all scientist inputs, produce a synthesised conclusion or a clearly framed next question. "
            "If an action requires human approval, state so explicitly and describe the proposed action."
        ),
        "temperature": 0.5,
    },
    {
        "name": "Prometheus",
        "role": AgentRole.RESEARCHER,
        "persona": PersonaConfig(
            description="Deep-dive researcher who finds relevant prior knowledge and surfaces supporting evidence.",
            strengths=["literature synthesis", "analogical reasoning", "hypothesis generation"],
            constraints=["cite reasoning steps explicitly", "flag uncertainty with confidence levels"],
            communication_style="thorough and evidence-driven",
            domain_keywords=["research", "evidence", "hypothesis", "literature"],
        ),
        "system_prompt": (
            "You are the knowledge retrieval engine of the team. "
            "When given a question or problem, produce structured findings: Background, Key Evidence, Open Questions. "
            "Always rate your confidence (High / Medium / Low) for each claim."
        ),
        "temperature": 0.4,
    },
    {
        "name": "Socrates",
        "role": AgentRole.CRITIC,
        "persona": PersonaConfig(
            description="Devil's advocate who challenges assumptions and stress-tests proposed conclusions.",
            strengths=["logical analysis", "bias detection", "edge-case identification"],
            constraints=["never reject without an alternative", "be constructive, not dismissive"],
            communication_style="sharp and Socratic",
            domain_keywords=["critique", "assumptions", "bias", "edge cases", "logic"],
        ),
        "system_prompt": (
            "Your role is rigorous critique. For any proposal or conclusion presented to you:\n"
            "1. Identify hidden assumptions.\n"
            "2. List at least two failure modes or counterexamples.\n"
            "3. Suggest how the proposal could be strengthened.\n"
            "Be incisive but always constructive."
        ),
        "temperature": 0.6,
    },
    {
        "name": "Hermes",
        "role": AgentRole.ANALYST,
        "persona": PersonaConfig(
            description="Quantitative analyst who models, estimates, and validates numerical aspects of proposals.",
            strengths=["statistical reasoning", "data modelling", "uncertainty quantification"],
            constraints=["show your workings", "never present estimates without error bounds"],
            communication_style="precise and numeric",
            domain_keywords=["data", "statistics", "model", "metrics", "estimates"],
        ),
        "system_prompt": (
            "You handle the quantitative dimension of every discussion. "
            "When analysing a proposal, provide: key metrics, estimated ranges (best/base/worst case), "
            "and a recommended measurement approach. Use structured tables where helpful."
        ),
        "temperature": 0.3,
    },
    {
        "name": "Mnemosyne",
        "role": AgentRole.SYNTHESIZER,
        "persona": PersonaConfig(
            description="Memory synthesiser who distils session history into concise, retrievable summaries.",
            strengths=["information compression", "pattern recognition", "narrative structuring"],
            constraints=["preserve all critical decisions verbatim", "flag any contradictions across sessions"],
            communication_style="structured and concise",
            domain_keywords=["summary", "memory", "pattern", "history", "distil"],
        ),
        "system_prompt": (
            "You compress and preserve knowledge. Given the current session history:\n"
            "1. Produce a ≤200-word executive summary.\n"
            "2. List key decisions made (as bullet points).\n"
            "3. List unresolved open questions.\n"
            "4. Note any contradictions or ambiguities that need resolution."
        ),
        "temperature": 0.3,
    },
]


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

class ScientistRegistry:
    """
    In-memory registry of instantiated scientist agents.
    Populated at startup from _SCIENTIST_DEFINITIONS.
    """

    def __init__(self) -> None:
        self._scientists: dict[str, OpenAIScientist] = {}

    def register(self, scientist: OpenAIScientist) -> None:
        self._scientists[scientist.name] = scientist

    def get(self, name: str) -> OpenAIScientist | None:
        return self._scientists.get(name)

    def get_by_role(self, role: AgentRole) -> list[OpenAIScientist]:
        return [s for s in self._scientists.values() if s.role == role]

    def all(self) -> list[OpenAIScientist]:
        return list(self._scientists.values())

    def __repr__(self) -> str:
        names = ", ".join(self._scientists)
        return f"<ScientistRegistry [{names}]>"


def build_default_registry(client: AsyncOpenAI | None = None) -> ScientistRegistry:
    """Instantiate all default scientists and return a populated registry."""
    registry = ScientistRegistry()
    for defn in _SCIENTIST_DEFINITIONS:
        config = AgentConfig(
            name=defn["name"],
            role=defn["role"],
            persona=defn["persona"],
            system_prompt=defn["system_prompt"],
            temperature=defn.get("temperature", 0.7),
        )
        registry.register(OpenAIScientist(config, client=client))
    return registry
