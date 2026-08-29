import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import DbSession, InternalUser, TenantContext, WritableTenantContext
from app.models.ai_employee import AIEmployee, AIVersion
from app.models.enums import AIVersionStatus
from app.schemas.ai_employee import (
    AIEmployeeCreate,
    AIEmployeeResponse,
    AIEmployeeUpdate,
    AIVersionCreate,
    AIVersionResponse,
)

router = APIRouter(prefix="/businesses/{business_id}/ai-employees", tags=["ai-employees"])


async def _get_ai_employee(
    db: DbSession, business_id: uuid.UUID, ai_employee_id: uuid.UUID
) -> AIEmployee:
    ai_employee = await db.get(AIEmployee, ai_employee_id)
    if ai_employee is None or ai_employee.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI employee not found",
        )
    return ai_employee


@router.get("", response_model=list[AIEmployeeResponse])
async def list_ai_employees(context: TenantContext, db: DbSession) -> list[AIEmployee]:
    result = await db.execute(
        select(AIEmployee)
        .where(AIEmployee.business_id == context.business_id)
        .order_by(AIEmployee.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=AIEmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_ai_employee(
    payload: AIEmployeeCreate, context: WritableTenantContext, db: DbSession
) -> AIEmployee:
    ai_employee = AIEmployee(
        business_id=context.business_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(ai_employee)
    await db.commit()
    await db.refresh(ai_employee)
    return ai_employee


@router.get("/{ai_employee_id}", response_model=AIEmployeeResponse)
async def get_ai_employee(
    ai_employee_id: uuid.UUID, context: TenantContext, db: DbSession
) -> AIEmployee:
    return await _get_ai_employee(db, context.business_id, ai_employee_id)


@router.patch("/{ai_employee_id}", response_model=AIEmployeeResponse)
async def update_ai_employee(
    ai_employee_id: uuid.UUID,
    payload: AIEmployeeUpdate,
    context: WritableTenantContext,
    db: DbSession,
) -> AIEmployee:
    ai_employee = await _get_ai_employee(db, context.business_id, ai_employee_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ai_employee, field, value)

    await db.commit()
    await db.refresh(ai_employee)
    return ai_employee


@router.get("/{ai_employee_id}/versions", response_model=list[AIVersionResponse])
async def list_versions(
    ai_employee_id: uuid.UUID, context: TenantContext, db: DbSession
) -> list[AIVersion]:
    await _get_ai_employee(db, context.business_id, ai_employee_id)
    result = await db.execute(
        select(AIVersion)
        .where(AIVersion.ai_employee_id == ai_employee_id)
        .order_by(AIVersion.version_number.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/{ai_employee_id}/versions",
    response_model=AIVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_version(
    ai_employee_id: uuid.UUID,
    payload: AIVersionCreate,
    context: TenantContext,
    user: InternalUser,
    db: DbSession,
) -> AIVersion:
    """AI configuration is authored by internal trainers, never business owners."""
    await _get_ai_employee(db, context.business_id, ai_employee_id)

    highest = await db.execute(
        select(func.max(AIVersion.version_number)).where(AIVersion.ai_employee_id == ai_employee_id)
    )
    next_number = (highest.scalar_one() or 0) + 1

    version = AIVersion(
        ai_employee_id=ai_employee_id,
        version_number=next_number,
        configuration=payload.configuration,
        status=AIVersionStatus.DRAFT,
        created_by=user.id,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


@router.post("/{ai_employee_id}/versions/{version_id}/deploy", response_model=AIVersionResponse)
async def deploy_version(
    ai_employee_id: uuid.UUID,
    version_id: uuid.UUID,
    context: TenantContext,
    user: InternalUser,
    db: DbSession,
) -> AIVersion:
    """Only approved versions may go live, per the versioning rules."""
    ai_employee = await _get_ai_employee(db, context.business_id, ai_employee_id)

    version = await db.get(AIVersion, version_id)
    if version is None or version.ai_employee_id != ai_employee_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI version not found",
        )

    if version.status != AIVersionStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only an approved version can be deployed",
        )

    previous = await db.execute(
        select(AIVersion).where(
            AIVersion.ai_employee_id == ai_employee_id,
            AIVersion.status == AIVersionStatus.LIVE,
        )
    )
    for live_version in previous.scalars().all():
        live_version.status = AIVersionStatus.ARCHIVED

    version.status = AIVersionStatus.LIVE
    version.deployed_at = datetime.now(UTC)
    ai_employee.current_version_id = version.id

    await db.commit()
    await db.refresh(version)
    return version
