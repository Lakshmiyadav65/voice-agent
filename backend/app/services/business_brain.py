"""Deterministic lookups over structured business data.

Every function here answers from the database or reports that it does not know.
Nothing in this module may guess, approximate, or interpolate a business fact —
an unknown product must surface as `found=False` so the conversation layer can
say so honestly or escalate to a human.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business_brain import BusinessFAQ, BusinessRule, Offer
from app.models.enums import ContentStatus, OfferStatus, ProductStatus
from app.models.product import Inventory, Product, ProductPrice, ProductVariant


@dataclass
class PriceResult:
    found: bool
    price: Decimal | None = None
    currency: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    source: str = "product_prices"


@dataclass
class ScheduledPrice:
    price: Decimal
    currency: str
    effective_from: datetime


@dataclass
class StockResult:
    found: bool
    quantity: int = 0
    locations: dict[str, int] = field(default_factory=dict)
    source: str = "inventory"

    @property
    def in_stock(self) -> bool:
        return self.found and self.quantity > 0


@dataclass
class VariantView:
    variant: ProductVariant
    price: PriceResult
    stock: StockResult


@dataclass
class ProductLookupResult:
    """Outcome of a structured product lookup.

    `found=False` carries no product data by design; callers must not substitute
    a nearby match. `suggestions` exists only so a human or the AI can offer
    alternatives explicitly, never to answer the original question.
    """

    found: bool
    product: Product | None = None
    variants: list[VariantView] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    reason: str | None = None


def _normalize(text: str) -> str:
    return " ".join(text.strip().lower().split())


async def resolve_price(
    db: AsyncSession,
    product_variant_id: uuid.UUID,
    at: datetime | None = None,
) -> PriceResult:
    """Return the price in force at `at`.

    The active row is the one with the latest `effective_from` that has already
    started and has not been closed out. A future-dated row is therefore ignored
    until its moment arrives, which is how a scheduled change activates without
    any model retraining or redeployment.
    """
    moment = at or datetime.now(UTC)

    result = await db.execute(
        select(ProductPrice)
        .where(
            ProductPrice.product_variant_id == product_variant_id,
            ProductPrice.effective_from <= moment,
            (ProductPrice.effective_to.is_(None)) | (ProductPrice.effective_to > moment),
        )
        .order_by(ProductPrice.effective_from.desc(), ProductPrice.created_at.desc())
        .limit(1)
    )
    price_row = result.scalar_one_or_none()

    if price_row is None:
        return PriceResult(found=False)

    return PriceResult(
        found=True,
        price=price_row.price,
        currency=price_row.currency,
        effective_from=price_row.effective_from,
        effective_to=price_row.effective_to,
    )


async def get_scheduled_price_changes(
    db: AsyncSession,
    product_variant_id: uuid.UUID,
    at: datetime | None = None,
) -> list[ScheduledPrice]:
    """Price rows that have not taken effect yet."""
    moment = at or datetime.now(UTC)

    result = await db.execute(
        select(ProductPrice)
        .where(
            ProductPrice.product_variant_id == product_variant_id,
            ProductPrice.effective_from > moment,
        )
        .order_by(ProductPrice.effective_from.asc())
    )

    return [
        ScheduledPrice(
            price=row.price,
            currency=row.currency,
            effective_from=row.effective_from,
        )
        for row in result.scalars().all()
    ]


async def check_inventory(
    db: AsyncSession,
    product_variant_id: uuid.UUID,
    location: str | None = None,
) -> StockResult:
    query = select(Inventory).where(Inventory.product_variant_id == product_variant_id)
    if location is not None:
        query = query.where(Inventory.location == location)

    result = await db.execute(query)
    rows = list(result.scalars().all())

    if not rows:
        return StockResult(found=False)

    return StockResult(
        found=True,
        quantity=sum(row.quantity for row in rows),
        locations={row.location: row.quantity for row in rows},
    )


async def _build_variant_views(
    db: AsyncSession,
    variants: list[ProductVariant],
    at: datetime | None,
) -> list[VariantView]:
    views = []
    for variant in variants:
        views.append(
            VariantView(
                variant=variant,
                price=await resolve_price(db, variant.id, at),
                stock=await check_inventory(db, variant.id),
            )
        )
    return views


async def find_product(
    db: AsyncSession,
    business_id: uuid.UUID,
    product_name: str,
    variant_name: str | None = None,
    at: datetime | None = None,
) -> ProductLookupResult:
    """Look up a product by exact (case-insensitive) name within one business.

    Deliberately not a fuzzy search. A near-miss returns `found=False` with
    suggestions, so the AI can never present a different product's price as the
    answer to the question that was asked.
    """
    normalized = _normalize(product_name)
    if not normalized:
        return ProductLookupResult(found=False, reason="empty_query")

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.variants))
        .where(
            Product.business_id == business_id,
            func.lower(Product.name) == normalized,
            Product.status != ProductStatus.DISCONTINUED,
        )
    )
    product = result.scalars().first()

    if product is None:
        return ProductLookupResult(
            found=False,
            reason="product_not_found",
            suggestions=await suggest_product_names(db, business_id, normalized),
        )

    variants = list(product.variants)

    if variant_name is not None:
        wanted = _normalize(variant_name)
        variants = [v for v in variants if _normalize(v.variant_name) == wanted]
        if not variants:
            return ProductLookupResult(
                found=False,
                reason="variant_not_found",
                suggestions=[v.variant_name for v in product.variants],
            )

    if not variants:
        return ProductLookupResult(found=False, reason="no_variants_configured")

    return ProductLookupResult(
        found=True,
        product=product,
        variants=await _build_variant_views(db, variants, at),
    )


async def list_product_names(db: AsyncSession, business_id: uuid.UUID) -> list[str]:
    """Active catalogue names, used to spot a product mentioned in speech."""
    result = await db.execute(
        select(Product.name).where(
            Product.business_id == business_id,
            Product.status == ProductStatus.ACTIVE,
        )
    )
    return list(result.scalars().all())


async def suggest_product_names(
    db: AsyncSession,
    business_id: uuid.UUID,
    query: str,
    limit: int = 5,
) -> list[str]:
    """Names containing the query, offered as alternatives rather than answers."""
    result = await db.execute(
        select(Product.name)
        .where(
            Product.business_id == business_id,
            Product.status == ProductStatus.ACTIVE,
            func.lower(Product.name).like(f"%{query}%"),
        )
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_active_offers(
    db: AsyncSession,
    business_id: uuid.UUID,
    at: datetime | None = None,
) -> list[Offer]:
    moment = at or datetime.now(UTC)

    result = await db.execute(
        select(Offer)
        .where(
            Offer.business_id == business_id,
            Offer.status == OfferStatus.ACTIVE,
            Offer.effective_from <= moment,
            (Offer.effective_to.is_(None)) | (Offer.effective_to > moment),
        )
        .order_by(Offer.effective_from.desc())
    )
    return list(result.scalars().all())


async def get_published_faqs(db: AsyncSession, business_id: uuid.UUID) -> list[BusinessFAQ]:
    result = await db.execute(
        select(BusinessFAQ)
        .where(
            BusinessFAQ.business_id == business_id,
            BusinessFAQ.status == ContentStatus.PUBLISHED,
        )
        .order_by(BusinessFAQ.created_at.asc())
    )
    return list(result.scalars().all())


async def get_active_rules(db: AsyncSession, business_id: uuid.UUID) -> list[BusinessRule]:
    result = await db.execute(
        select(BusinessRule)
        .where(
            BusinessRule.business_id == business_id,
            BusinessRule.status == ContentStatus.PUBLISHED,
        )
        .order_by(BusinessRule.created_at.asc())
    )
    return list(result.scalars().all())
