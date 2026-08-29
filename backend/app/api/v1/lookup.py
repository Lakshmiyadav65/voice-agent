"""Structured-retrieval endpoints the conversation layer calls during a call.

These mirror the tool surface named in the TRD (`find_product`,
`check_inventory`). They answer strictly from stored business data and report
`found=False` when the data is absent, so the AI never has a fabricated value
available to speak.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Query

from app.api.deps import DbSession, TenantContext
from app.schemas.product import (
    ProductLookupResponse,
    ResolvedPrice,
    ResolvedStock,
    VariantLookupView,
)
from app.services import business_brain
from app.services.business_brain import ProductLookupResult

router = APIRouter(prefix="/businesses/{business_id}/lookup", tags=["lookup"])


def _to_response(result: ProductLookupResult, resolved_at: datetime) -> ProductLookupResponse:
    if not result.found or result.product is None:
        return ProductLookupResponse(
            found=False,
            reason=result.reason,
            suggestions=result.suggestions,
            resolved_at=resolved_at,
        )

    return ProductLookupResponse(
        found=True,
        product_id=result.product.id,
        product_name=result.product.name,
        brand=result.product.brand,
        category=result.product.category,
        resolved_at=resolved_at,
        variants=[
            VariantLookupView(
                variant_id=view.variant.id,
                variant_name=view.variant.variant_name,
                sku=view.variant.sku,
                attributes=view.variant.attributes,
                price=ResolvedPrice(
                    found=view.price.found,
                    price=view.price.price,
                    currency=view.price.currency,
                    effective_from=view.price.effective_from,
                    effective_to=view.price.effective_to,
                ),
                stock=ResolvedStock(
                    found=view.stock.found,
                    in_stock=view.stock.in_stock,
                    quantity=view.stock.quantity,
                    locations=view.stock.locations,
                ),
            )
            for view in result.variants
        ],
    )


@router.get("/product", response_model=ProductLookupResponse)
async def lookup_product(
    context: TenantContext,
    db: DbSession,
    name: str = Query(min_length=1, description="Exact product name"),
    variant: str | None = Query(default=None, description="Exact variant name"),
    at: datetime | None = Query(
        default=None, description="Resolve prices as of this moment; defaults to now"
    ),
) -> ProductLookupResponse:
    resolved_at = at or datetime.now(UTC)
    result = await business_brain.find_product(
        db,
        business_id=context.business_id,
        product_name=name,
        variant_name=variant,
        at=resolved_at,
    )
    return _to_response(result, resolved_at)
