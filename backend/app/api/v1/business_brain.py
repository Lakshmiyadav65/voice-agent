import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DbSession, TenantContext, WritableTenantContext
from app.core.database import Base
from app.models.business_brain import BusinessFAQ, BusinessRule, Offer
from app.schemas.business_brain import (
    FAQCreate,
    FAQResponse,
    FAQUpdate,
    OfferCreate,
    OfferResponse,
    OfferUpdate,
    RuleCreate,
    RuleResponse,
    RuleUpdate,
)
from app.services import business_brain

router = APIRouter(prefix="/businesses/{business_id}", tags=["business-brain"])


async def _get_owned(
    db: AsyncSession,
    model: type[Base],
    business_id: uuid.UUID,
    record_id: uuid.UUID,
    label: str,
):
    record = await db.get(model, record_id)
    if record is None or record.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
    return record


@router.get("/offers", response_model=list[OfferResponse])
async def list_offers(
    context: TenantContext,
    db: DbSession,
    active_only: bool = Query(default=False),
    at: datetime | None = Query(default=None),
) -> list[Offer]:
    if active_only:
        return await business_brain.get_active_offers(db, context.business_id, at)

    result = await db.execute(
        select(Offer)
        .where(Offer.business_id == context.business_id)
        .order_by(Offer.effective_from.desc())
    )
    return list(result.scalars().all())


@router.post("/offers", response_model=OfferResponse, status_code=status.HTTP_201_CREATED)
async def create_offer(
    payload: OfferCreate, context: WritableTenantContext, db: DbSession
) -> Offer:
    data = payload.model_dump()
    effective_from = data.pop("effective_from") or datetime.now(UTC)
    effective_to = data.pop("effective_to")

    if effective_to is not None and effective_to <= effective_from:
        raise HTTPException(
            status_code=422,
            detail="effective_to must be later than effective_from",
        )

    offer = Offer(
        business_id=context.business_id,
        effective_from=effective_from,
        effective_to=effective_to,
        **data,
    )
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    return offer


@router.patch("/offers/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: uuid.UUID,
    payload: OfferUpdate,
    context: WritableTenantContext,
    db: DbSession,
) -> Offer:
    offer = await _get_owned(db, Offer, context.business_id, offer_id, "Offer")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(offer, field, value)

    await db.commit()
    await db.refresh(offer)
    return offer


@router.delete("/offers/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offer(offer_id: uuid.UUID, context: WritableTenantContext, db: DbSession) -> None:
    offer = await _get_owned(db, Offer, context.business_id, offer_id, "Offer")
    await db.delete(offer)
    await db.commit()


@router.get("/faqs", response_model=list[FAQResponse])
async def list_faqs(
    context: TenantContext,
    db: DbSession,
    published_only: bool = Query(default=False),
) -> list[BusinessFAQ]:
    if published_only:
        return await business_brain.get_published_faqs(db, context.business_id)

    result = await db.execute(
        select(BusinessFAQ)
        .where(BusinessFAQ.business_id == context.business_id)
        .order_by(BusinessFAQ.created_at.asc())
    )
    return list(result.scalars().all())


@router.post("/faqs", response_model=FAQResponse, status_code=status.HTTP_201_CREATED)
async def create_faq(
    payload: FAQCreate, context: WritableTenantContext, db: DbSession
) -> BusinessFAQ:
    faq = BusinessFAQ(business_id=context.business_id, **payload.model_dump())
    db.add(faq)
    await db.commit()
    await db.refresh(faq)
    return faq


@router.patch("/faqs/{faq_id}", response_model=FAQResponse)
async def update_faq(
    faq_id: uuid.UUID,
    payload: FAQUpdate,
    context: WritableTenantContext,
    db: DbSession,
) -> BusinessFAQ:
    faq = await _get_owned(db, BusinessFAQ, context.business_id, faq_id, "FAQ")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(faq, field, value)

    await db.commit()
    await db.refresh(faq)
    return faq


@router.delete("/faqs/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_faq(faq_id: uuid.UUID, context: WritableTenantContext, db: DbSession) -> None:
    faq = await _get_owned(db, BusinessFAQ, context.business_id, faq_id, "FAQ")
    await db.delete(faq)
    await db.commit()


@router.get("/rules", response_model=list[RuleResponse])
async def list_rules(context: TenantContext, db: DbSession) -> list[BusinessRule]:
    result = await db.execute(
        select(BusinessRule)
        .where(BusinessRule.business_id == context.business_id)
        .order_by(BusinessRule.created_at.asc())
    )
    return list(result.scalars().all())


@router.post("/rules", response_model=RuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: RuleCreate, context: WritableTenantContext, db: DbSession
) -> BusinessRule:
    rule = BusinessRule(business_id=context.business_id, **payload.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: uuid.UUID,
    payload: RuleUpdate,
    context: WritableTenantContext,
    db: DbSession,
) -> BusinessRule:
    rule = await _get_owned(db, BusinessRule, context.business_id, rule_id, "Rule")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: uuid.UUID, context: WritableTenantContext, db: DbSession) -> None:
    rule = await _get_owned(db, BusinessRule, context.business_id, rule_id, "Rule")
    await db.delete(rule)
    await db.commit()
