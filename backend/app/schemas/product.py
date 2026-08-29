import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ProductStatus


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=100)
    description: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=100)
    description: str | None = None
    status: ProductStatus | None = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    name: str
    brand: str | None
    category: str | None
    description: str | None
    status: ProductStatus


class VariantCreate(BaseModel):
    variant_name: str = Field(min_length=1, max_length=255)
    sku: str | None = Field(default=None, max_length=100)
    attributes: dict[str, Any] = Field(default_factory=dict)


class VariantUpdate(BaseModel):
    variant_name: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = Field(default=None, max_length=100)
    attributes: dict[str, Any] | None = None


class VariantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    variant_name: str
    sku: str | None
    attributes: dict[str, Any]


class PriceCreate(BaseModel):
    """Set a price now, or schedule one by passing a future `effective_from`."""

    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    effective_from: datetime | None = None
    effective_to: datetime | None = None


class PriceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_variant_id: uuid.UUID
    price: Decimal
    currency: str
    effective_from: datetime
    effective_to: datetime | None


class InventoryUpdate(BaseModel):
    quantity: int = Field(ge=0)
    location: str = Field(default="default", max_length=255)


class InventoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_variant_id: uuid.UUID
    quantity: int
    location: str
    updated_at: datetime


class ResolvedPrice(BaseModel):
    found: bool
    price: Decimal | None = None
    currency: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    source: str = "product_prices"


class ScheduledPriceResponse(BaseModel):
    price: Decimal
    currency: str
    effective_from: datetime


class ResolvedStock(BaseModel):
    found: bool
    in_stock: bool = False
    quantity: int = 0
    locations: dict[str, int] = Field(default_factory=dict)
    source: str = "inventory"


class VariantLookupView(BaseModel):
    variant_id: uuid.UUID
    variant_name: str
    sku: str | None
    attributes: dict[str, Any]
    price: ResolvedPrice
    stock: ResolvedStock


class ProductLookupResponse(BaseModel):
    """Structured-retrieval answer handed to the conversation layer.

    When `found` is false there is no product payload at all — the AI must
    respond that the information is unavailable rather than improvise.
    """

    found: bool
    reason: str | None = None
    product_id: uuid.UUID | None = None
    product_name: str | None = None
    brand: str | None = None
    category: str | None = None
    variants: list[VariantLookupView] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    resolved_at: datetime
    source: str = "structured_data"
