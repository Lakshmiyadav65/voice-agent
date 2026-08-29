import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    CallDirection,
    CallOutcome,
    CallStatus,
    EscalationReason,
    Language,
    RecordingConsent,
    TurnRole,
)


class StartCallRequest(BaseModel):
    phone_number: str = Field(min_length=6, max_length=20)
    direction: CallDirection = CallDirection.INBOUND
    ai_employee_id: uuid.UUID | None = None
    language: Language = Language.ENGLISH


class OutboundCallRequest(BaseModel):
    to_number: str = Field(min_length=6, max_length=20)
    from_number: str = Field(min_length=6, max_length=20)
    ai_employee_id: uuid.UUID | None = None
    language: Language = Language.ENGLISH


class CallUtteranceRequest(BaseModel):
    text: str = Field(min_length=1)


class EndCallRequest(BaseModel):
    status: CallStatus = CallStatus.COMPLETED
    outcome: CallOutcome | None = None


class ConsentRequest(BaseModel):
    consent: RecordingConsent


class TranscriptEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sequence: int
    speaker: TurnRole
    text: str
    language: Language
    spoken_at: datetime
    transcript_metadata: dict[str, Any] = Field(default_factory=dict)


class CallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    ai_employee_id: uuid.UUID | None
    customer_id: uuid.UUID | None
    lead_id: uuid.UUID | None
    direction: CallDirection
    phone_number: str
    provider: str | None
    provider_call_id: str | None
    status: CallStatus
    outcome: CallOutcome | None
    language: Language
    recording_consent: RecordingConsent
    recording_path: str | None
    summary: str | None
    escalation_reason: EscalationReason | None
    error: str | None
    duration_seconds: int
    started_at: datetime | None
    ended_at: datetime | None


class CallDetailResponse(CallResponse):
    transcript: list[TranscriptEntry] = Field(default_factory=list)


class TelephonyWebhookResponse(BaseModel):
    """Acknowledgement returned to the telephony vendor."""

    received: bool
    call_id: uuid.UUID | None = None
    action: str
