import uuid

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    DbSession,
    Embedder,
    Storage,
    TenantContext,
    WritableTenantContext,
)
from app.config import settings
from app.models.enums import DocumentSourceType
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.schemas.knowledge import (
    ChunkResponse,
    DocumentResponse,
    ManualDocumentCreate,
    SearchHit,
    SearchRequest,
    SearchResponse,
)
from app.services import knowledge as knowledge_service
from app.services.knowledge import KnowledgeIngestionError

router = APIRouter(prefix="/businesses/{business_id}/knowledge", tags=["knowledge"])


async def _get_document(
    db: AsyncSession, business_id: uuid.UUID, document_id: uuid.UUID
) -> KnowledgeDocument:
    document = await db.get(KnowledgeDocument, document_id)
    if document is None or document.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


@router.get("/documents", response_model=list[DocumentResponse])
async def list_documents(context: TenantContext, db: DbSession) -> list[KnowledgeDocument]:
    result = await db.execute(
        select(KnowledgeDocument)
        .where(KnowledgeDocument.business_id == context.business_id)
        .order_by(KnowledgeDocument.created_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    context: WritableTenantContext,
    db: DbSession,
    storage: Storage,
    embedder: Embedder,
    file: UploadFile = File(...),
) -> KnowledgeDocument:
    data = await file.read()

    if not data:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")

    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.max_upload_bytes} byte limit",
        )

    try:
        return await knowledge_service.ingest_document(
            db,
            storage,
            embedder,
            business_id=context.business_id,
            filename=file.filename or "upload",
            data=data,
            content_type=file.content_type,
            created_by=context.user.id,
        )
    except KnowledgeIngestionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/documents/text",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_text_document(
    payload: ManualDocumentCreate,
    context: WritableTenantContext,
    db: DbSession,
    storage: Storage,
    embedder: Embedder,
) -> KnowledgeDocument:
    filename = payload.name if payload.name.endswith(".txt") else f"{payload.name}.txt"

    try:
        return await knowledge_service.ingest_document(
            db,
            storage,
            embedder,
            business_id=context.business_id,
            filename=filename,
            data=payload.content.encode("utf-8"),
            content_type="text/plain",
            created_by=context.user.id,
            source_type=DocumentSourceType.MANUAL,
        )
    except KnowledgeIngestionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID, context: TenantContext, db: DbSession
) -> KnowledgeDocument:
    return await _get_document(db, context.business_id, document_id)


@router.get("/documents/{document_id}/chunks", response_model=list[ChunkResponse])
async def list_chunks(
    document_id: uuid.UUID, context: TenantContext, db: DbSession
) -> list[KnowledgeChunk]:
    await _get_document(db, context.business_id, document_id)
    result = await db.execute(
        select(KnowledgeChunk)
        .where(KnowledgeChunk.document_id == document_id)
        .order_by(KnowledgeChunk.chunk_index.asc())
    )
    return list(result.scalars().all())


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    context: WritableTenantContext,
    db: DbSession,
    storage: Storage,
) -> None:
    document = await _get_document(db, context.business_id, document_id)
    await knowledge_service.delete_document(db, storage, document)


@router.post("/documents/{document_id}/reembed", response_model=DocumentResponse)
async def reembed_document(
    document_id: uuid.UUID,
    context: WritableTenantContext,
    db: DbSession,
    storage: Storage,
    embedder: Embedder,
) -> KnowledgeDocument:
    document = await _get_document(db, context.business_id, document_id)
    try:
        return await knowledge_service.reembed_document(db, storage, embedder, document)
    except (KnowledgeIngestionError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/search", response_model=SearchResponse)
async def search_knowledge(
    payload: SearchRequest,
    context: TenantContext,
    db: DbSession,
    embedder: Embedder,
) -> SearchResponse:
    """Retrieve supporting passages for a question, always with their sources."""
    hits = await knowledge_service.search_knowledge(
        db,
        embedder,
        business_id=context.business_id,
        query=payload.query,
        top_k=payload.top_k,
        min_score=payload.min_score,
    )

    return SearchResponse(
        found=bool(hits),
        query=payload.query,
        hits=[
            SearchHit(
                chunk_id=hit.chunk_id,
                document_id=hit.document_id,
                document_name=hit.document_name,
                chunk_index=hit.chunk_index,
                content=hit.content,
                score=hit.score,
                metadata=hit.metadata,
            )
            for hit in hits
        ],
    )


@router.get("/search", response_model=SearchResponse)
async def search_knowledge_get(
    context: TenantContext,
    db: DbSession,
    embedder: Embedder,
    q: str = Query(min_length=1),
    top_k: int = Query(default=5, ge=1, le=20),
) -> SearchResponse:
    return await search_knowledge(SearchRequest(query=q, top_k=top_k), context, db, embedder)
