from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKey
from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.business import BusinessMember


class User(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default=UserRole.BUSINESS_USER, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    memberships: Mapped[list["BusinessMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_internal(self) -> bool:
        return self.role in {UserRole.PLATFORM_ADMIN, UserRole.AI_TRAINER}
