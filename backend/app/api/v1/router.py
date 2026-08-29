from fastapi import APIRouter

from app.api.v1 import (
    ai_employees,
    auth,
    business_brain,
    businesses,
    calls,
    conversation,
    knowledge,
    lookup,
    products,
    telephony,
)

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


router.include_router(auth.router)
router.include_router(businesses.router)
router.include_router(ai_employees.router)
router.include_router(products.router)
router.include_router(business_brain.router)
router.include_router(knowledge.router)
router.include_router(lookup.router)
router.include_router(conversation.router)
router.include_router(calls.router)
router.include_router(telephony.router)
