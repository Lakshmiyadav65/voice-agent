"""Text-driven conversation sessions.

This is the surface the Test Lab and the trainer console use to exercise an AI
employee without placing a real call. Phase 7 attaches the same engine to
telephony audio.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import (
    LLM,
    Conversations,
    DbSession,
    Embedder,
    TenantContext,
)
from app.schemas.conversation import (
    ConversationResponse,
    GroundingView,
    KnowledgeSourceView,
    LanguageDetectionRequest,
    LanguageDetectionResponse,
    RouteRequest,
    RouteResponse,
    RoutingView,
    StartConversationRequest,
    ToolCallView,
    TurnRequest,
    TurnResponse,
    TurnView,
    ViolationView,
)
from app.services.conversation import ConversationEngine, TurnResult
from app.services.conversation_state import Conversation
from app.services.language import choose_reply_language, detect_language
from app.services.router import route as route_utterance

router = APIRouter(prefix="/businesses/{business_id}/conversations", tags=["conversations"])


def _to_conversation_response(conversation: Conversation) -> ConversationResponse:
    return ConversationResponse(
        id=conversation.id,
        business_id=conversation.business_id,
        ai_employee_id=conversation.ai_employee_id,
        state=conversation.state,
        language=conversation.language,
        escalation_reason=conversation.escalation_reason,
        slots=conversation.slots.as_dict(),
        turns=[
            TurnView(
                role=turn.role,
                text=turn.text,
                language=turn.language,
                at=turn.at,
                interrupted=turn.interrupted,
                metadata=turn.metadata,
            )
            for turn in conversation.turns
        ],
        started_at=conversation.started_at,
        ended_at=conversation.ended_at,
    )


def _to_turn_response(result: TurnResult) -> TurnResponse:
    return TurnResponse(
        conversation_id=result.conversation_id,
        reply=result.reply,
        language=result.language,
        state=result.state,
        transcript=result.transcript,
        blocked=result.blocked,
        escalated=result.escalated,
        escalation_reason=result.escalation_reason,
        product_found=result.product_found,
        routing=RoutingView(
            intent=result.intent,
            source=result.source,
            reason=result.routing_reason,
        ),
        tool_calls=[
            ToolCallView(
                tool=call.tool,
                status=call.status,
                message=call.message,
                arguments=call.arguments,
                data=call.data,
                duration_ms=call.duration_ms,
            )
            for call in result.tool_calls
        ],
        grounding=GroundingView(
            # Normalised so 15000.00 and 15000 read the same to a reviewer.
            prices=[format(price.normalize(), "f") for price in sorted(result.grounding.prices)],
            quantities=sorted(result.grounding.quantities),
            product_names=sorted(result.grounding.product_names),
            passage_count=len(result.grounding.knowledge_passages),
        ),
        violations=[ViolationView(kind=v.kind, detail=v.detail) for v in result.violations],
        knowledge_sources=[KnowledgeSourceView(**source) for source in result.knowledge_sources],
    )


def _load(store: Conversations, business_id: uuid.UUID, conversation_id: uuid.UUID):
    conversation = store.get(conversation_id)
    if conversation is None or conversation.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def start_conversation(
    payload: StartConversationRequest,
    context: TenantContext,
    store: Conversations,
    llm: LLM,
    embedder: Embedder,
) -> ConversationResponse:
    conversation = store.create(context.business_id, payload.ai_employee_id)
    conversation.language = payload.language

    engine = ConversationEngine(llm=llm, embedder=embedder)
    engine.greet(conversation, context.business)

    return _to_conversation_response(conversation)


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: uuid.UUID, context: TenantContext, store: Conversations
) -> ConversationResponse:
    return _to_conversation_response(_load(store, context.business_id, conversation_id))


@router.post("/{conversation_id}/turns", response_model=TurnResponse)
async def send_turn(
    conversation_id: uuid.UUID,
    payload: TurnRequest,
    context: TenantContext,
    db: DbSession,
    store: Conversations,
    llm: LLM,
    embedder: Embedder,
) -> TurnResponse:
    conversation = _load(store, context.business_id, conversation_id)

    if not conversation.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conversation is {conversation.state}",
        )

    engine = ConversationEngine(llm=llm, embedder=embedder)
    result = await engine.handle_turn(db, conversation, context.business, payload.message)
    return _to_turn_response(result)


@router.post("/{conversation_id}/interrupt", response_model=ConversationResponse)
async def interrupt(
    conversation_id: uuid.UUID, context: TenantContext, store: Conversations
) -> ConversationResponse:
    """Record that the caller spoke over the AI."""
    conversation = _load(store, context.business_id, conversation_id)
    conversation.interrupt()
    return _to_conversation_response(conversation)


@router.post("/{conversation_id}/end", response_model=ConversationResponse)
async def end_conversation(
    conversation_id: uuid.UUID, context: TenantContext, store: Conversations
) -> ConversationResponse:
    conversation = _load(store, context.business_id, conversation_id)
    conversation.end()
    return _to_conversation_response(conversation)


@router.post("/route", response_model=RouteResponse)
async def preview_routing(
    payload: RouteRequest, context: TenantContext, db: DbSession
) -> RouteResponse:
    """Show which source an utterance would be answered from.

    Used by the Test Lab to verify source selection without running a full turn.
    """
    from app.services import business_brain

    names = await business_brain.list_product_names(db, context.business_id)
    mentioned = any(name.lower() in payload.text.lower() for name in names)

    decision = route_utterance(payload.text, has_product_mention=mentioned)
    return RouteResponse(
        intent=decision.intent,
        source=decision.source,
        tools=decision.tools,
        reason=decision.reason,
        confidence=decision.confidence,
    )


@router.post("/detect-language", response_model=LanguageDetectionResponse)
async def detect_language_endpoint(
    payload: LanguageDetectionRequest, context: TenantContext
) -> LanguageDetectionResponse:
    result = detect_language(payload.text)
    return LanguageDetectionResponse(
        language=result.language,
        confidence=round(result.confidence, 3),
        code_switched=result.code_switched,
        reply_language=choose_reply_language(result),
        markers=list(result.tanglish_markers),
    )
