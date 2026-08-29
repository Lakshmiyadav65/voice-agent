import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DocumentSourceType, DocumentStatus


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    name: str
    source_type: DocumentSourceType
    content_type: str | None
    status: DocumentStatus
    error: str | None
    chunk_count: int
    doc_metadata: dict[str, Any]
    created_at: datetime


class ChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    chunk_index: int
    content: str
    chunk_metadata: dict[str, Any]


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    min_score: float = Field(default=0.10, ge=0.0, le=1.0)


class SearchHit(BaseModel):
    """A retrieved passage with the citation the AI must carry alongside it."""

    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_name: str
    chunk_index: int
    content: str
    score: float
    metadata: dict[str, Any]


class SearchResponse(BaseModel):
    found: bool
    query: str
    hits: list[SearchHit] = Field(default_factory=list)
    source: str = "knowledge_base"


class ManualDocumentCreate(BaseModel):
    """Add knowledge as text without uploading a file."""

    name: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
