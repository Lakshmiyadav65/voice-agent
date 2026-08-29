import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import JSONType, TimestampMixin, UUIDPrimaryKey
from app.models.enums import AppointmentStatus, LeadStatus

if TYPE_CHECKING:
    from app.models.business import Business


class Customer(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("business_id", "phone", name="uq_customer_phone"),
        Index("ix_customers_business_phone", "business_id", "phone"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    whatsapp_phone: Mapped[str | None] = mapped_column(String(20))
    customer_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONType, default=dict, nullable=False
    )

    business: Mapped["Business"] = relationship(back_populates="customers")
    leads: Mapped[list["Lead"]] = relationship(
        back_populates="customer", cascade="all, delete-orphan"
    )
    appointments: Mapped[list["Appointment"]] = relationship(
        back_populates="customer", cascade="all, delete-orphan"
    )


class Lead(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "leads"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    source: Mapped[str] = mapped_column(String(50), default="ai_call", nullable=False)
    requirement: Mapped[str | None] = mapped_column(Text)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    location: Mapped[str | None] = mapped_column(String(255))
    intent: Mapped[str | None] = mapped_column(String(100))
    lead_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    status: Mapped[str] = mapped_column(String(50), default=LeadStatus.NEW, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)

    business: Mapped["Business"] = relationship(back_populates="leads")
    customer: Mapped["Customer"] = relationship(back_populates="leads")


class Appointment(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "appointments"
    __table_args__ = (Index("ix_appointments_business_start", "business_id", "start_time"),)

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL")
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default=AppointmentStatus.REQUESTED, nullable=False
    )
    source: Mapped[str] = mapped_column(String(50), default="ai_call", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    business: Mapped["Business"] = relationship(back_populates="appointments")
    customer: Mapped["Customer"] = relationship(back_populates="appointments")
