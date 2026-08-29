import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, TimestampMixin, UUIDPrimaryKey
from app.models.enums import BusinessStatus

if TYPE_CHECKING:
    from app.models.ai_employee import AIEmployee
    from app.models.business_brain import BusinessFAQ, BusinessRule, Offer
    from app.models.call import Call
    from app.models.crm import Appointment, Customer, Lead
    from app.models.knowledge import KnowledgeDocument
    from app.models.product import Product
    from app.models.user import User


class Business(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "businesses"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata", nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default=BusinessStatus.ONBOARDING, nullable=False
    )

    members: Mapped[list["BusinessMember"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    ai_employees: Mapped[list["AIEmployee"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    products: Mapped[list["Product"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    offers: Mapped[list["Offer"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    faqs: Mapped[list["BusinessFAQ"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    rules: Mapped[list["BusinessRule"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    knowledge_documents: Mapped[list["KnowledgeDocument"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    customers: Mapped[list["Customer"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    leads: Mapped[list["Lead"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    appointments: Mapped[list["Appointment"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    calls: Mapped[list["Call"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )


class BusinessMember(Base, UUIDPrimaryKey, CreatedAtMixin):
    __tablename__ = "business_members"
    __table_args__ = (UniqueConstraint("business_id", "user_id", name="uq_business_member"),)

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)

    business: Mapped["Business"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")
