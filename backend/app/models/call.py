import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, JSONType, TimestampMixin, UUIDPrimaryKey
from app.models.enums import CallStatus, Language, RecordingConsent

if TYPE_CHECKING:
    from app.models.business import Business


class Call(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "calls"
    __table_args__ = (
        UniqueConstraint("business_id", "provider_call_id", name="uq_call_provider_id"),
        Index("ix_calls_business_started", "business_id", "started_at"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    ai_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("ai_employees.id", ondelete="SET NULL")
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL")
    )

    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    # Identifier assigned by the telephony vendor; lets webhooks find the call.
    provider_call_id: Mapped[str | None] = mapped_column(String(255))
    provider: Mapped[str | None] = mapped_column(String(50))

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    status: Mapped[str] = mapped_column(String(50), default=CallStatus.RINGING, nullable=False)
    outcome: Mapped[str | None] = mapped_column(String(50))
    language: Mapped[str] = mapped_column(String(10), default=Language.ENGLISH, nullable=False)

    # Recording is only retained where the caller agreed, so consent and path
    # are stored together and checked together.
    recording_consent: Mapped[str] = mapped_column(
        String(20), default=RecordingConsent.NOT_ASKED, nullable=False
    )
    recording_path: Mapped[str | None] = mapped_column(String(1024))

    summary: Mapped[str | None] = mapped_column(Text)
    escalation_reason: Mapped[str | None] = mapped_column(String(50))
    error: Mapped[str | None] = mapped_column(Text)
    call_metadata: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)

    business: Mapped["Business"] = relationship(back_populates="calls")
    transcripts: Mapped[list["CallTranscript"]] = relationship(
        back_populates="call",
        cascade="all, delete-orphan",
        order_by="CallTranscript.sequence",
    )


class CallTranscript(Base, UUIDPrimaryKey, CreatedAtMixin):
    """One utterance in a call, stored in order with what produced it."""

    __tablename__ = "call_transcripts"
    __table_args__ = (UniqueConstraint("call_id", "sequence", name="uq_call_transcript_sequence"),)

    call_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("calls.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker: Mapped[str] = mapped_column(String(20), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(10), default=Language.UNKNOWN, nullable=False)
    spoken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Retrieved sources, tool calls, and guardrail verdicts for this utterance.
    transcript_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONType, default=dict, nullable=False
    )

    call: Mapped["Call"] = relationship(back_populates="transcripts")
