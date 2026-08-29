"""Knowledge ingestion and retrieval.

    Upload -> Parse -> Chunk -> Embed -> Store -> Retrieve -> Context -> LLM

Retrieval always returns source metadata, so any statement the AI makes from the
knowledge base can be traced back to the document and passage it came from.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import DocumentSourceType, DocumentStatus
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.providers.embeddings import EmbeddingProvider, cosine_similarity
from app.providers.storage import StorageProvider
from app.services.chunking import chunk_text
from app.services.parsing import (
    EmptyDocumentError,
    UnsupportedDocumentError,
    parse_document,
)

# Below this cosine similarity a passage is treated as unrelated to the question.
# Returning nothing is the correct answer when nothing relevant was stored.
DEFAULT_MIN_SCORE = 0.10
DEFAULT_TOP_K = 5


class KnowledgeIngestionError(Exception):
    pass


@dataclass
class RetrievedChunk:
    """A passage plus everything needed to cite it."""

    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_name: str
    chunk_index: int
    content: str
    score: float
    metadata: dict


async def ingest_document(
    db: AsyncSession,
    storage: StorageProvider,
    embedder: EmbeddingProvider,
    *,
    business_id: uuid.UUID,
    filename: str,
    data: bytes,
    content_type: str | None = None,
    created_by: uuid.UUID | None = None,
    source_type: DocumentSourceType = DocumentSourceType.UPLOAD,
) -> KnowledgeDocument:
    """Run the full pipeline and persist the document with its chunks.

    A parse or embed failure records the reason on the document and re-raises,
    so a broken upload is visible to the trainer instead of silently producing an
    empty knowledge source.
    """
    storage_path = await storage.save(business_id, filename, data)

    document = KnowledgeDocument(
        business_id=business_id,
        name=filename,
        source_type=source_type,
        storage_path=storage_path,
        content_type=content_type,
        status=DocumentStatus.PROCESSING,
        created_by=created_by,
        doc_metadata={"size_bytes": len(data)},
    )
    db.add(document)
    await db.flush()

    try:
        text = parse_document(filename, data)
    except (UnsupportedDocumentError, EmptyDocumentError) as exc:
        document.status = DocumentStatus.FAILED
        document.error = str(exc)
        await db.commit()
        await db.refresh(document)
        raise KnowledgeIngestionError(str(exc)) from exc

    chunks = chunk_text(text)
    if not chunks:
        document.status = DocumentStatus.FAILED
        document.error = "Document produced no chunks"
        await db.commit()
        await db.refresh(document)
        raise KnowledgeIngestionError("Document produced no chunks")

    embeddings = await embedder.embed([chunk.content for chunk in chunks])

    for chunk, embedding in zip(chunks, embeddings, strict=True):
        db.add(
            KnowledgeChunk(
                document_id=document.id,
                business_id=business_id,
                chunk_index=chunk.index,
                content=chunk.content,
                embedding=embedding,
                chunk_metadata={
                    "document_name": filename,
                    "char_start": chunk.char_start,
                    "char_end": chunk.char_end,
                    "embedding_model": embedder.name,
                },
            )
        )

    document.status = DocumentStatus.READY
    document.chunk_count = len(chunks)
    document.doc_metadata = {
        **document.doc_metadata,
        "characters": len(text),
        "embedding_model": embedder.name,
        "ingested_at": datetime.now(UTC).isoformat(),
    }

    await db.commit()
    await db.refresh(document)
    return document


async def _search_postgres(
    db: AsyncSession,
    business_id: uuid.UUID,
    query_embedding: list[float],
    top_k: int,
) -> list[tuple[KnowledgeChunk, float]]:
    """Nearest neighbours using the pgvector cosine distance operator."""
    distance = KnowledgeChunk.embedding.cosine_distance(query_embedding).label("distance")

    result = await db.execute(
        select(KnowledgeChunk, distance)
        .where(KnowledgeChunk.business_id == business_id)
        .order_by(distance)
        .limit(top_k)
    )
    return [(chunk, 1.0 - float(dist)) for chunk, dist in result.all()]


async def _search_in_python(
    db: AsyncSession,
    business_id: uuid.UUID,
    query_embedding: list[float],
    top_k: int,
) -> list[tuple[KnowledgeChunk, float]]:
    """Portable fallback for databases without pgvector."""
    result = await db.execute(
        select(KnowledgeChunk).where(KnowledgeChunk.business_id == business_id)
    )
    scored = [
        (chunk, cosine_similarity(query_embedding, list(chunk.embedding)))
        for chunk in result.scalars().all()
    ]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:top_k]


async def search_knowledge(
    db: AsyncSession,
    embedder: EmbeddingProvider,
    *,
    business_id: uuid.UUID,
    query: str,
    top_k: int = DEFAULT_TOP_K,
    min_score: float = DEFAULT_MIN_SCORE,
) -> list[RetrievedChunk]:
    """Return the most relevant passages for a question, scoped to one business.

    An empty list is a valid and meaningful result: it means the business has
    stored nothing that answers this question.
    """
    if not query.strip():
        return []

    query_embedding = await embedder.embed_one(query)

    if db.bind is not None and db.bind.dialect.name == "postgresql":
        scored = await _search_postgres(db, business_id, query_embedding, top_k)
    else:
        scored = await _search_in_python(db, business_id, query_embedding, top_k)

    relevant = [(chunk, score) for chunk, score in scored if score >= min_score]
    if not relevant:
        return []

    document_ids = {chunk.document_id for chunk, _ in relevant}
    documents = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id.in_(document_ids))
    )
    names = {doc.id: doc.name for doc in documents.scalars().all()}

    return [
        RetrievedChunk(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            document_name=names.get(chunk.document_id, "unknown"),
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            score=round(score, 4),
            metadata=dict(chunk.chunk_metadata or {}),
        )
        for chunk, score in relevant
    ]


async def delete_document(
    db: AsyncSession,
    storage: StorageProvider,
    document: KnowledgeDocument,
) -> None:
    if document.storage_path:
        await storage.delete(document.storage_path)

    await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id))
    await db.delete(document)
    await db.commit()


async def reembed_document(
    db: AsyncSession,
    storage: StorageProvider,
    embedder: EmbeddingProvider,
    document: KnowledgeDocument,
) -> KnowledgeDocument:
    """Rebuild chunks from the stored original after a provider change."""
    if not document.storage_path:
        raise KnowledgeIngestionError("Document has no stored original to re-read")

    data = await storage.load(document.storage_path)
    text = parse_document(document.name, data)
    chunks = chunk_text(text)

    await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id))
    embeddings = await embedder.embed([chunk.content for chunk in chunks])

    for chunk, embedding in zip(chunks, embeddings, strict=True):
        db.add(
            KnowledgeChunk(
                document_id=document.id,
                business_id=document.business_id,
                chunk_index=chunk.index,
                content=chunk.content,
                embedding=embedding,
                chunk_metadata={
                    "document_name": document.name,
                    "char_start": chunk.char_start,
                    "char_end": chunk.char_end,
                    "embedding_model": embedder.name,
                },
            )
        )

    document.chunk_count = len(chunks)
    document.status = DocumentStatus.READY
    document.error = None

    await db.commit()
    await db.refresh(document)
    return document
