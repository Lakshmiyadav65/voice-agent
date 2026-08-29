import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import (
    CurrentUser,
    DbSession,
    TenantContext,
    WritableTenantContext,
)
from app.models.business import Business, BusinessMember
from app.models.enums import INTERNAL_ROLES, BusinessMemberRole, BusinessStatus
from app.models.user import User
from app.schemas.business import (
    BusinessCreate,
    BusinessResponse,
    BusinessUpdate,
    MemberInvite,
    MemberResponse,
)

router = APIRouter(prefix="/businesses", tags=["businesses"])


@router.get("", response_model=list[BusinessResponse])
async def list_businesses(db: DbSession, user: CurrentUser) -> list[Business]:
    """Internal users see all businesses; business users see only their own."""
    if user.role in INTERNAL_ROLES:
        query = select(Business).order_by(Business.created_at.desc())
    else:
        query = (
            select(Business)
            .join(BusinessMember, BusinessMember.business_id == Business.id)
            .where(BusinessMember.user_id == user.id)
            .order_by(Business.created_at.desc())
        )

    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
async def create_business(payload: BusinessCreate, db: DbSession, user: CurrentUser) -> Business:
    """The creating user becomes the business owner."""
    business = Business(
        name=payload.name,
        industry=payload.industry,
        phone=payload.phone,
        email=payload.email,
        timezone=payload.timezone,
        status=BusinessStatus.ONBOARDING,
    )
    db.add(business)
    await db.flush()

    db.add(
        BusinessMember(
            business_id=business.id,
            user_id=user.id,
            role=BusinessMemberRole.OWNER,
        )
    )
    await db.commit()
    await db.refresh(business)
    return business


@router.get("/{business_id}", response_model=BusinessResponse)
async def get_business(context: TenantContext) -> Business:
    return context.business


@router.patch("/{business_id}", response_model=BusinessResponse)
async def update_business(
    payload: BusinessUpdate, context: WritableTenantContext, db: DbSession
) -> Business:
    business = context.business
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(business, field, value)

    await db.commit()
    await db.refresh(business)
    return business


@router.get("/{business_id}/members", response_model=list[MemberResponse])
async def list_members(context: TenantContext, db: DbSession) -> list[BusinessMember]:
    result = await db.execute(
        select(BusinessMember).where(BusinessMember.business_id == context.business_id)
    )
    return list(result.scalars().all())


@router.post(
    "/{business_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    payload: MemberInvite, context: WritableTenantContext, db: DbSession
) -> BusinessMember:
    result = await db.execute(select(User).where(func.lower(User.email) == payload.email.lower()))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user found with this email",
        )

    existing = await db.execute(
        select(BusinessMember).where(
            BusinessMember.business_id == context.business_id,
            BusinessMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user is already a member of the business",
        )

    member = BusinessMember(
        business_id=context.business_id,
        user_id=user.id,
        role=payload.role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{business_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    member_id: uuid.UUID, context: WritableTenantContext, db: DbSession
) -> None:
    member = await db.get(BusinessMember, member_id)
    if member is None or member.business_id != context.business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    if member.role == BusinessMemberRole.OWNER:
        owners = await db.execute(
            select(func.count())
            .select_from(BusinessMember)
            .where(
                BusinessMember.business_id == context.business_id,
                BusinessMember.role == BusinessMemberRole.OWNER,
            )
        )
        if owners.scalar_one() <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A business must retain at least one owner",
            )

    await db.delete(member)
    await db.commit()
