import uuid
from typing import TYPE_CHECKING, Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, JSONType, TimestampMixin, UUIDPrimaryKey
from app.models.enums import DocumentSourceType, DocumentStatus

if TYPE_CHECKING:
    from app.models.business import Business

# Dimension of the configured embedding provider. Changing this requires a
# migration and a re-embed of every stored chunk.
EMBEDDING_DIMENSIONS = 384

# pgvector in PostgreSQL; JSON elsewhere so the suite runs without the extension.
EmbeddingType = Vector(EMBEDDING_DIMENSIONS).with_variant(JSON(), "sqlite")


class KnowledgeDocument(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "knowledge_documents"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(
        String(50), default=DocumentSourceType.UPLOAD, nullable=False
    )
    storage_path: Mapped[str | None] = mapped_column(String(1024))
    content_type: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), default=DocumentStatus.PENDING, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    doc_metadata: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    business: Mapped["Business"] = relationship(back_populates="knowledge_documents")
    chunks: Mapped[list["KnowledgeChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class KnowledgeChunk(Base, UUIDPrimaryKey, CreatedAtMixin):
    """A retrievable passage with the metadata needed to cite its source."""

    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_knowledge_chunk_index"),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # Denormalised so retrieval can filter by tenant without a join.
    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(EmbeddingType, nullable=False)
    chunk_metadata: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)

    document: Mapped["KnowledgeDocument"] = relationship(back_populates="chunks")
