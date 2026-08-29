import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import JSONType, TimestampMixin, UUIDPrimaryKey
from app.models.enums import ContentStatus, OfferStatus, RuleType

if TYPE_CHECKING:
    from app.models.business import Business


class Offer(Base, UUIDPrimaryKey, TimestampMixin):
    """Offers resolve by effective window, the same way prices do."""

    __tablename__ = "offers"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    value: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(50), default=OfferStatus.ACTIVE, nullable=False)

    business: Mapped["Business"] = relationship(back_populates="offers")


class BusinessFAQ(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "business_faqs"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=ContentStatus.PUBLISHED, nullable=False)

    business: Mapped["Business"] = relationship(back_populates="faqs")


class BusinessRule(Base, UUIDPrimaryKey, TimestampMixin):
    """Conversation restrictions, escalation rules, and allowed actions."""

    __tablename__ = "business_rules"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(50), default=RuleType.POLICY, nullable=False)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=ContentStatus.PUBLISHED, nullable=False)

    business: Mapped["Business"] = relationship(back_populates="rules")
