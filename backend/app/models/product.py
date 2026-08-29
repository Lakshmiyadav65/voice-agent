import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import (
    CreatedAtMixin,
    JSONType,
    TimestampMixin,
    UpdatedAtMixin,
    UUIDPrimaryKey,
)
from app.models.enums import ProductStatus

if TYPE_CHECKING:
    from app.models.business import Business


class Product(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "products"
    __table_args__ = (Index("ix_products_business_name", "business_id", "name"),)

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(255))
    category: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default=ProductStatus.ACTIVE, nullable=False)

    business: Mapped["Business"] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class ProductVariant(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "product_variants"
    __table_args__ = (UniqueConstraint("product_id", "variant_name", name="uq_product_variant"),)

    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sku: Mapped[str | None] = mapped_column(String(100))
    variant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)

    product: Mapped["Product"] = relationship(back_populates="variants")
    prices: Mapped[list["ProductPrice"]] = relationship(
        back_populates="variant", cascade="all, delete-orphan"
    )
    inventory: Mapped[list["Inventory"]] = relationship(
        back_populates="variant", cascade="all, delete-orphan"
    )


class ProductPrice(Base, UUIDPrimaryKey, CreatedAtMixin):
    """Price rows are append-only and resolved by effective window.

    A scheduled change is a new row with a future `effective_from`; the active
    price is the row with the latest `effective_from` that has already started.
    This is what lets prices change without touching the conversational model.
    """

    __tablename__ = "product_prices"
    __table_args__ = (
        Index("ix_product_prices_variant_effective", "product_variant_id", "effective_from"),
    )

    product_variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    variant: Mapped["ProductVariant"] = relationship(back_populates="prices")


class Inventory(Base, UUIDPrimaryKey, UpdatedAtMixin):
    __tablename__ = "inventory"
    __table_args__ = (
        UniqueConstraint("product_variant_id", "location", name="uq_inventory_location"),
    )

    product_variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    location: Mapped[str] = mapped_column(String(255), default="default", nullable=False)

    variant: Mapped["ProductVariant"] = relationship(back_populates="inventory")
