import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import BusinessMemberRole, BusinessStatus


class BusinessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    industry: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    timezone: str = Field(default="Asia/Kolkata", max_length=50)


class BusinessUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    industry: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    timezone: str | None = Field(default=None, max_length=50)
    status: BusinessStatus | None = None


class BusinessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    industry: str | None
    phone: str | None
    email: str | None
    timezone: str
    status: BusinessStatus


class MemberInvite(BaseModel):
    email: EmailStr
    role: BusinessMemberRole = BusinessMemberRole.STAFF


class MemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    user_id: uuid.UUID
    role: BusinessMemberRole
