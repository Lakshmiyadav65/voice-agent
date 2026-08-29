import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    ConversationState,
    EscalationReason,
    Intent,
    Language,
    RouteSource,
    ToolName,
    ToolStatus,
    TurnRole,
)


class StartConversationRequest(BaseModel):
    ai_employee_id: uuid.UUID | None = None
    language: Language = Language.ENGLISH


class TurnRequest(BaseModel):
    message: str = Field(min_length=1)


class TurnView(BaseModel):
    role: TurnRole
    text: str
    language: Language
    at: datetime
    interrupted: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeSourceView(BaseModel):
    document_id: str
    document_name: str
    chunk_index: int
    score: float


class GroundingView(BaseModel):
    """What the reply was permitted to assert, for trainer review."""

    prices: list[str] = Field(default_factory=list)
    quantities: list[int] = Field(default_factory=list)
    product_names: list[str] = Field(default_factory=list)
    passage_count: int = 0


class ViolationView(BaseModel):
    kind: str
    detail: str


class ToolCallView(BaseModel):
    """One tool invocation, logged for trainer review and evaluation."""

    tool: ToolName
    status: ToolStatus
    message: str = ""
    arguments: dict[str, Any] = Field(default_factory=dict)
    data: dict[str, Any] = Field(default_factory=dict)
    duration_ms: int = 0


class RoutingView(BaseModel):
    intent: Intent
    source: RouteSource
    reason: str = ""


class TurnResponse(BaseModel):
    conversation_id: uuid.UUID
    reply: str
    language: Language
    state: ConversationState
    transcript: str
    blocked: bool = False
    escalated: bool = False
    escalation_reason: EscalationReason | None = None
    product_found: bool | None = None
    routing: RoutingView
    grounding: GroundingView
    violations: list[ViolationView] = Field(default_factory=list)
    knowledge_sources: list[KnowledgeSourceView] = Field(default_factory=list)
    tool_calls: list[ToolCallView] = Field(default_factory=list)


class RouteRequest(BaseModel):
    text: str = Field(min_length=1)


class RouteResponse(BaseModel):
    intent: Intent
    source: RouteSource
    tools: list[ToolName] = Field(default_factory=list)
    reason: str
    confidence: float


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    ai_employee_id: uuid.UUID | None
    state: ConversationState
    language: Language
    escalation_reason: EscalationReason | None
    slots: dict[str, Any]
    turns: list[TurnView]
    started_at: datetime
    ended_at: datetime | None


class LanguageDetectionRequest(BaseModel):
    text: str = Field(min_length=1)


class LanguageDetectionResponse(BaseModel):
    language: Language
    confidence: float
    code_switched: bool
    reply_language: Language
    markers: list[str] = Field(default_factory=list)
