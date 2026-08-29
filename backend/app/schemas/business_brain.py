import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ContentStatus, OfferStatus, RuleType


class OfferCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    value: dict[str, Any] = Field(default_factory=dict)
    effective_from: datetime | None = None
    effective_to: datetime | None = None


class OfferUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    value: dict[str, Any] | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    status: OfferStatus | None = None


class OfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    name: str
    description: str | None
    value: dict[str, Any]
    effective_from: datetime
    effective_to: datetime | None
    status: OfferStatus


class FAQCreate(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class FAQUpdate(BaseModel):
    question: str | None = Field(default=None, min_length=1)
    answer: str | None = Field(default=None, min_length=1)
    status: ContentStatus | None = None


class FAQResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    question: str
    answer: str
    status: ContentStatus


class RuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    rule_type: RuleType = RuleType.POLICY
    configuration: dict[str, Any] = Field(default_factory=dict)


class RuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    rule_type: RuleType | None = None
    configuration: dict[str, Any] | None = None
    status: ContentStatus | None = None


class RuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    name: str
    rule_type: RuleType
    configuration: dict[str, Any]
    status: ContentStatus
