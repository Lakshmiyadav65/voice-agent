import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DbSession, TenantContext, WritableTenantContext
from app.models.product import Inventory, Product, ProductPrice, ProductVariant
from app.schemas.product import (
    InventoryResponse,
    InventoryUpdate,
    PriceCreate,
    PriceResponse,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
    ScheduledPriceResponse,
    VariantCreate,
    VariantResponse,
    VariantUpdate,
)
from app.services import business_brain

router = APIRouter(prefix="/businesses/{business_id}/products", tags=["products"])


async def _get_product(db: AsyncSession, business_id: uuid.UUID, product_id: uuid.UUID) -> Product:
    product = await db.get(Product, product_id)
    if product is None or product.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


async def _get_variant(
    db: AsyncSession,
    business_id: uuid.UUID,
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
) -> ProductVariant:
    await _get_product(db, business_id, product_id)
    variant = await db.get(ProductVariant, variant_id)
    if variant is None or variant.product_id != product_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
    return variant


@router.get("", response_model=list[ProductResponse])
async def list_products(context: TenantContext, db: DbSession) -> list[Product]:
    result = await db.execute(
        select(Product)
        .where(Product.business_id == context.business_id)
        .order_by(Product.name.asc())
    )
    return list(result.scalars().all())


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate, context: WritableTenantContext, db: DbSession
) -> Product:
    duplicate = await db.execute(
        select(Product).where(
            Product.business_id == context.business_id,
            func.lower(Product.name) == payload.name.strip().lower(),
        )
    )
    if duplicate.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A product with this name already exists",
        )

    product = Product(business_id=context.business_id, **payload.model_dump())
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: uuid.UUID, context: TenantContext, db: DbSession) -> Product:
    return await _get_product(db, context.business_id, product_id)


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    context: WritableTenantContext,
    db: DbSession,
) -> Product:
    product = await _get_product(db, context.business_id, product_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, field, value)

    await db.commit()
    await db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID, context: WritableTenantContext, db: DbSession
) -> None:
    product = await _get_product(db, context.business_id, product_id)
    await db.delete(product)
    await db.commit()


@router.get("/{product_id}/variants", response_model=list[VariantResponse])
async def list_variants(
    product_id: uuid.UUID, context: TenantContext, db: DbSession
) -> list[ProductVariant]:
    await _get_product(db, context.business_id, product_id)
    result = await db.execute(
        select(ProductVariant)
        .where(ProductVariant.product_id == product_id)
        .order_by(ProductVariant.variant_name.asc())
    )
    return list(result.scalars().all())


@router.post(
    "/{product_id}/variants",
    response_model=VariantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_variant(
    product_id: uuid.UUID,
    payload: VariantCreate,
    context: WritableTenantContext,
    db: DbSession,
) -> ProductVariant:
    await _get_product(db, context.business_id, product_id)

    duplicate = await db.execute(
        select(ProductVariant).where(
            ProductVariant.product_id == product_id,
            ProductVariant.variant_name == payload.variant_name,
        )
    )
    if duplicate.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This variant already exists for the product",
        )

    variant = ProductVariant(product_id=product_id, **payload.model_dump())
    db.add(variant)
    await db.commit()
    await db.refresh(variant)
    return variant


@router.patch("/{product_id}/variants/{variant_id}", response_model=VariantResponse)
async def update_variant(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    payload: VariantUpdate,
    context: WritableTenantContext,
    db: DbSession,
) -> ProductVariant:
    variant = await _get_variant(db, context.business_id, product_id, variant_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(variant, field, value)

    await db.commit()
    await db.refresh(variant)
    return variant


@router.get("/{product_id}/variants/{variant_id}/prices", response_model=list[PriceResponse])
async def list_prices(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    context: TenantContext,
    db: DbSession,
) -> list[ProductPrice]:
    await _get_variant(db, context.business_id, product_id, variant_id)
    result = await db.execute(
        select(ProductPrice)
        .where(ProductPrice.product_variant_id == variant_id)
        .order_by(ProductPrice.effective_from.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/{product_id}/variants/{variant_id}/prices",
    response_model=PriceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def set_price(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    payload: PriceCreate,
    context: WritableTenantContext,
    db: DbSession,
) -> ProductPrice:
    """Set a price now, or schedule one with a future `effective_from`.

    Prices are append-only: a scheduled change is simply a row that has not
    started yet, so the active answer changes the moment it becomes effective.
    """
    await _get_variant(db, context.business_id, product_id, variant_id)

    effective_from = payload.effective_from or datetime.now(UTC)
    if payload.effective_to is not None and payload.effective_to <= effective_from:
        raise HTTPException(
            status_code=422,
            detail="effective_to must be later than effective_from",
        )

    price = ProductPrice(
        product_variant_id=variant_id,
        price=payload.price,
        currency=payload.currency.upper(),
        effective_from=effective_from,
        effective_to=payload.effective_to,
    )
    db.add(price)
    await db.commit()
    await db.refresh(price)
    return price


@router.get(
    "/{product_id}/variants/{variant_id}/prices/scheduled",
    response_model=list[ScheduledPriceResponse],
)
async def list_scheduled_prices(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    context: TenantContext,
    db: DbSession,
    at: datetime | None = Query(default=None),
) -> list[ScheduledPriceResponse]:
    await _get_variant(db, context.business_id, product_id, variant_id)
    scheduled = await business_brain.get_scheduled_price_changes(db, variant_id, at)
    return [
        ScheduledPriceResponse(
            price=item.price,
            currency=item.currency,
            effective_from=item.effective_from,
        )
        for item in scheduled
    ]


@router.get(
    "/{product_id}/variants/{variant_id}/inventory",
    response_model=list[InventoryResponse],
)
async def get_inventory(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    context: TenantContext,
    db: DbSession,
) -> list[Inventory]:
    await _get_variant(db, context.business_id, product_id, variant_id)
    result = await db.execute(select(Inventory).where(Inventory.product_variant_id == variant_id))
    return list(result.scalars().all())


@router.put(
    "/{product_id}/variants/{variant_id}/inventory",
    response_model=InventoryResponse,
)
async def set_inventory(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    payload: InventoryUpdate,
    context: WritableTenantContext,
    db: DbSession,
) -> Inventory:
    await _get_variant(db, context.business_id, product_id, variant_id)

    result = await db.execute(
        select(Inventory).where(
            Inventory.product_variant_id == variant_id,
            Inventory.location == payload.location,
        )
    )
    record = result.scalars().first()

    if record is None:
        record = Inventory(
            product_variant_id=variant_id,
            quantity=payload.quantity,
            location=payload.location,
        )
        db.add(record)
    else:
        record.quantity = payload.quantity

    await db.commit()
    await db.refresh(record)
    return record
