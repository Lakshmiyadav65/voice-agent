import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AIEmployeeStatus, AIVersionStatus


class AIEmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class AIEmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: AIEmployeeStatus | None = None


class AIEmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    name: str
    description: str | None
    status: AIEmployeeStatus
    current_version_id: uuid.UUID | None


class AIVersionCreate(BaseModel):
    configuration: dict[str, Any] = Field(default_factory=dict)


class AIVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ai_employee_id: uuid.UUID
    version_number: int
    configuration: dict[str, Any]
    status: AIVersionStatus
    created_by: uuid.UUID | None
    deployed_at: datetime | None
