import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, JSONType, TimestampMixin, UUIDPrimaryKey
from app.models.enums import AIEmployeeStatus, AIVersionStatus

if TYPE_CHECKING:
    from app.models.business import Business


class AIEmployee(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "ai_employees"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default=AIEmployeeStatus.DRAFT, nullable=False)
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))

    business: Mapped["Business"] = relationship(back_populates="ai_employees")
    versions: Mapped[list["AIVersion"]] = relationship(
        back_populates="ai_employee", cascade="all, delete-orphan"
    )


class AIVersion(Base, UUIDPrimaryKey, CreatedAtMixin):
    __tablename__ = "ai_versions"
    __table_args__ = (
        UniqueConstraint("ai_employee_id", "version_number", name="uq_ai_version_number"),
    )

    ai_employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=AIVersionStatus.DRAFT, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    ai_employee: Mapped["AIEmployee"] = relationship(back_populates="versions")
