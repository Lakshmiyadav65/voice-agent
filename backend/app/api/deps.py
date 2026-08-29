import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.providers import (
    get_call_session_store,
    get_conversation_store,
    get_embedding_provider,
    get_llm_provider,
    get_storage_provider,
    get_stt_provider,
    get_telephony_provider,
    get_tts_provider,
)
from app.core.security import InvalidTokenError, user_id_from_token
from app.models.business import Business, BusinessMember
from app.models.enums import INTERNAL_ROLES, BusinessMemberRole, UserRole
from app.models.user import User
from app.providers.base import (
    LLMProvider,
    STTProvider,
    TelephonyProvider,
    TTSProvider,
)
from app.providers.embeddings import EmbeddingProvider
from app.providers.storage import StorageProvider
from app.services.conversation_state import ConversationStore

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

# Members with write access to business information; staff are read-only.
WRITE_ROLES = {BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER}


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise CREDENTIALS_ERROR

    try:
        user_id = user_id_from_token(credentials.credentials, "access")
    except InvalidTokenError as exc:
        raise CREDENTIALS_ERROR from exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise CREDENTIALS_ERROR

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_internal_user(user: CurrentUser) -> User:
    """Restrict a route to platform admins and AI trainers."""
    if user.role not in INTERNAL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This resource requires internal platform access",
        )
    return user


InternalUser = Annotated[User, Depends(require_internal_user)]


@dataclass
class BusinessContext:
    """Resolved tenant scope for the current request."""

    business: Business
    user: User
    member_role: BusinessMemberRole | None

    @property
    def business_id(self) -> uuid.UUID:
        return self.business.id

    @property
    def is_internal(self) -> bool:
        return self.user.role in INTERNAL_ROLES

    @property
    def can_write(self) -> bool:
        return self.is_internal or self.member_role in WRITE_ROLES


async def get_business_context(
    business_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    user: CurrentUser,
) -> BusinessContext:
    """Resolve and authorize the tenant for this request.

    Returns 404 rather than 403 for non-members so that business existence is
    not leaked across tenants.
    """
    business = await db.get(Business, business_id)
    is_internal = user.role in INTERNAL_ROLES

    member_role: BusinessMemberRole | None = None
    if business is not None:
        result = await db.execute(
            select(BusinessMember).where(
                BusinessMember.business_id == business_id,
                BusinessMember.user_id == user.id,
            )
        )
        membership = result.scalar_one_or_none()
        if membership is not None:
            member_role = BusinessMemberRole(membership.role)

    if business is None or (member_role is None and not is_internal):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found",
        )

    return BusinessContext(business=business, user=user, member_role=member_role)


TenantContext = Annotated[BusinessContext, Depends(get_business_context)]


async def require_business_write(context: TenantContext) -> BusinessContext:
    if not context.can_write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your role does not permit changes to this business",
        )
    return context


WritableTenantContext = Annotated[BusinessContext, Depends(require_business_write)]


def is_platform_admin(user: User) -> bool:
    return user.role == UserRole.PLATFORM_ADMIN


Storage = Annotated[StorageProvider, Depends(get_storage_provider)]
Embedder = Annotated[EmbeddingProvider, Depends(get_embedding_provider)]
LLM = Annotated[LLMProvider, Depends(get_llm_provider)]
STT = Annotated[STTProvider, Depends(get_stt_provider)]
TTS = Annotated[TTSProvider, Depends(get_tts_provider)]
Conversations = Annotated[ConversationStore, Depends(get_conversation_store)]
Telephony = Annotated[TelephonyProvider, Depends(get_telephony_provider)]
CallSessions = Annotated[dict, Depends(get_call_session_store)]
