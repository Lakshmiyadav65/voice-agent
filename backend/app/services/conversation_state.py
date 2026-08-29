"""Conversation state and memory for a single call.

Holds the turn history, the language the call has settled into, and the slots
gathered so far. Slots persist across turns so the customer never has to repeat
something they already said -- the requirement the PRD calls maintaining context.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.models.enums import ConversationState, EscalationReason, Language, TurnRole

# A call that cannot make progress after this many consecutive failures is
# handed to a human rather than looping.
MAX_CONSECUTIVE_FAILURES = 3

# Turns kept in the prompt window. Older turns stay in the transcript.
CONTEXT_WINDOW_TURNS = 12


@dataclass
class Turn:
    role: TurnRole
    text: str
    language: Language = Language.UNKNOWN
    at: datetime = field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = field(default_factory=dict)
    interrupted: bool = False


@dataclass
class Slots:
    """Facts gathered about the customer and their requirement."""

    customer_name: str | None = None
    product_interest: str | None = None
    variant_interest: str | None = None
    budget: str | None = None
    location: str | None = None
    phone: str | None = None
    requirement: str | None = None

    def update(self, **values: Any) -> list[str]:
        """Set any provided slot and report which ones changed."""
        changed = []
        for key, value in values.items():
            if value in (None, "") or not hasattr(self, key):
                continue
            if getattr(self, key) != value:
                setattr(self, key, value)
                changed.append(key)
        return changed

    def as_dict(self) -> dict[str, Any]:
        return {key: value for key, value in self.__dict__.items() if value not in (None, "")}

    @property
    def is_qualified(self) -> bool:
        return bool(self.product_interest and (self.budget or self.requirement))


@dataclass
class Conversation:
    business_id: uuid.UUID
    ai_employee_id: uuid.UUID | None = None
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    state: ConversationState = ConversationState.GREETING
    language: Language = Language.ENGLISH
    turns: list[Turn] = field(default_factory=list)
    slots: Slots = field(default_factory=Slots)
    consecutive_failures: int = 0
    escalation_reason: EscalationReason | None = None
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    ended_at: datetime | None = None

    @property
    def is_active(self) -> bool:
        return self.state not in (ConversationState.ENDED, ConversationState.ESCALATED)

    @property
    def turn_count(self) -> int:
        return sum(1 for turn in self.turns if turn.role is not TurnRole.SYSTEM)

    def add_turn(
        self,
        role: TurnRole,
        text: str,
        language: Language = Language.UNKNOWN,
        **metadata: Any,
    ) -> Turn:
        turn = Turn(role=role, text=text, language=language, metadata=metadata)
        self.turns.append(turn)
        return turn

    def recent_turns(self, limit: int = CONTEXT_WINDOW_TURNS) -> list[Turn]:
        conversational = [t for t in self.turns if t.role is not TurnRole.SYSTEM]
        return conversational[-limit:]

    def last_customer_turn(self) -> Turn | None:
        for turn in reversed(self.turns):
            if turn.role is TurnRole.CUSTOMER:
                return turn
        return None

    def interrupt(self) -> Turn | None:
        """Mark the in-flight AI turn as cut off by the customer.

        Barge-in is normal on voice calls. The partial utterance stays in the
        transcript so the AI does not repeat what the customer already heard.
        """
        for turn in reversed(self.turns):
            if turn.role is TurnRole.AI:
                turn.interrupted = True
                return turn
        return None

    def record_failure(self) -> bool:
        """Count a failed turn. Returns True once escalation is warranted."""
        self.consecutive_failures += 1
        return self.consecutive_failures >= MAX_CONSECUTIVE_FAILURES

    def record_success(self) -> None:
        self.consecutive_failures = 0

    def escalate(self, reason: EscalationReason) -> None:
        self.state = ConversationState.ESCALATED
        self.escalation_reason = reason
        self.ended_at = datetime.now(UTC)

    def end(self) -> None:
        self.state = ConversationState.ENDED
        self.ended_at = datetime.now(UTC)

    def advance(self, target: ConversationState) -> None:
        """Move forward through the call, never backwards out of a final state."""
        if self.state in (ConversationState.ESCALATED, ConversationState.ENDED):
            return
        self.state = target


class ConversationStore:
    """In-process session store.

    Phase 7 persists calls and transcripts to the database; this keeps live
    state for the duration of a call.
    """

    def __init__(self) -> None:
        self._sessions: dict[uuid.UUID, Conversation] = {}

    def create(
        self, business_id: uuid.UUID, ai_employee_id: uuid.UUID | None = None
    ) -> Conversation:
        conversation = Conversation(business_id=business_id, ai_employee_id=ai_employee_id)
        self._sessions[conversation.id] = conversation
        return conversation

    def get(self, conversation_id: uuid.UUID) -> Conversation | None:
        return self._sessions.get(conversation_id)

    def delete(self, conversation_id: uuid.UUID) -> None:
        self._sessions.pop(conversation_id, None)

    def for_business(self, business_id: uuid.UUID) -> list[Conversation]:
        return [c for c in self._sessions.values() if c.business_id == business_id]
