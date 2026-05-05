"""
Matadora Core — Phase 2: Agent Core
Base class for all AI-scientist agents.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AgentRole(str, Enum):
    LEAD       = "lead"
    ANALYST    = "analyst"
    CRITIC     = "critic"
    SYNTHESIZER = "synthesizer"
    RESEARCHER = "researcher"


class MessageRole(str, Enum):
    USER      = "user"
    ASSISTANT = "assistant"
    SYSTEM    = "system"
    TOOL      = "tool"


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class PersonaConfig(BaseModel):
    """Structured personality profile stored as JSONB in scientists_core.persona."""

    description:   str            = Field(..., description="One-sentence role description.")
    strengths:     list[str]      = Field(default_factory=list)
    constraints:   list[str]      = Field(default_factory=list)
    communication_style: str      = Field(default="neutral")
    domain_keywords: list[str]    = Field(default_factory=list)
    extra:         dict[str, Any] = Field(default_factory=dict)


class AgentMessage(BaseModel):
    """Single message produced or consumed by an agent."""

    id:           str         = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id:   str
    scientist_id: str | None  = None
    role:         MessageRole
    content:      str
    metadata:     dict[str, Any] = Field(default_factory=dict)
    parent_id:    str | None  = None
    created_at:   datetime    = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentConfig(BaseModel):
    """Full configuration for a scientist agent."""

    id:         str         = Field(default_factory=lambda: str(uuid.uuid4()))
    name:       str
    role:       AgentRole
    persona:    PersonaConfig
    system_prompt: str
    model:      str         = "gpt-4o"
    temperature: float      = 0.7
    max_tokens: int         = 2048


# ---------------------------------------------------------------------------
# Base agent
# ---------------------------------------------------------------------------

class BaseScientist(ABC):
    """
    Abstract base class for all Matadora scientist agents.

    Subclasses must implement:
      - build_system_prompt()  — construct the full system prompt from persona
      - process()              — main reasoning step given a list of messages

    The base class provides:
      - Identity & config management
      - Context window building (system + history + new message)
      - Hook points: before_process / after_process
    """

    def __init__(self, config: AgentConfig) -> None:
        self.config = config

    # ------------------------------------------------------------------
    # Identity helpers
    # ------------------------------------------------------------------

    @property
    def id(self) -> str:
        return self.config.id

    @property
    def name(self) -> str:
        return self.config.name

    @property
    def role(self) -> AgentRole:
        return self.config.role

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    def build_system_prompt(self) -> str:
        """Return the system prompt that defines this agent's behaviour."""

    @abstractmethod
    async def process(
        self,
        session_id: str,
        history: list[AgentMessage],
        new_message: AgentMessage,
    ) -> AgentMessage:
        """
        Core reasoning step.

        Parameters
        ----------
        session_id:  Active session UUID.
        history:     Ordered list of prior messages in this session.
        new_message: The message the agent must respond to.

        Returns
        -------
        AgentMessage with role=ASSISTANT produced by this agent.
        """

    # ------------------------------------------------------------------
    # Hooks (override to add side-effects)
    # ------------------------------------------------------------------

    async def before_process(
        self,
        session_id: str,
        history: list[AgentMessage],
        new_message: AgentMessage,
    ) -> None:
        """Called immediately before process(). Default: no-op."""

    async def after_process(
        self,
        session_id: str,
        response: AgentMessage,
    ) -> None:
        """Called immediately after process() returns. Default: no-op."""

    # ------------------------------------------------------------------
    # Context builder
    # ------------------------------------------------------------------

    def build_context(
        self,
        history: list[AgentMessage],
        new_message: AgentMessage,
        max_history: int = 20,
    ) -> list[dict[str, str]]:
        """
        Build the message list to send to the LLM.

        Structure:
          [system] → [last N history messages] → [new_message]
        """
        messages: list[dict[str, str]] = [
            {"role": "system", "content": self.build_system_prompt()}
        ]

        for msg in history[-max_history:]:
            messages.append({"role": msg.role.value, "content": msg.content})

        messages.append({"role": new_message.role.value, "content": new_message.content})
        return messages

    # ------------------------------------------------------------------
    # Entry point (wraps hooks + process)
    # ------------------------------------------------------------------

    async def run(
        self,
        session_id: str,
        history: list[AgentMessage],
        new_message: AgentMessage,
    ) -> AgentMessage:
        """Public entry point: hooks + process."""
        await self.before_process(session_id, history, new_message)
        response = await self.process(session_id, history, new_message)
        await self.after_process(session_id, response)
        return response

    # ------------------------------------------------------------------
    # Repr
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} name={self.name!r} role={self.role.value!r}>"
