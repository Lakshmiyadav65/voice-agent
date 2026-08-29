"""Call control, review, and audio streaming."""

import uuid

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    LLM,
    STT,
    TTS,
    CallSessions,
    Conversations,
    DbSession,
    Embedder,
    Telephony,
    TenantContext,
    WritableTenantContext,
)
from app.models.call import Call
from app.models.enums import CallStatus
from app.schemas.call import (
    CallDetailResponse,
    CallResponse,
    CallUtteranceRequest,
    ConsentRequest,
    EndCallRequest,
    OutboundCallRequest,
    StartCallRequest,
    TranscriptEntry,
)
from app.schemas.conversation import TurnResponse
from app.services.call import CallError, CallService, CallSession
from app.services.conversation import ConversationEngine

router = APIRouter(prefix="/businesses/{business_id}/calls", tags=["calls"])


def _build_service(llm, embedder, stt, tts, telephony, store) -> CallService:
    engine = ConversationEngine(llm=llm, embedder=embedder, stt=stt, tts=tts)
    return CallService(engine=engine, store=store, telephony=telephony)


async def _load_call(db: AsyncSession, business_id: uuid.UUID, call_id: uuid.UUID) -> Call:
    call = await db.get(Call, call_id)
    if call is None or call.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    return call


def _session_or_404(sessions: dict, call_id: uuid.UUID) -> CallSession:
    session = sessions.get(call_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This call is no longer live",
        )
    return session


@router.get("", response_model=list[CallResponse])
async def list_calls(
    context: TenantContext,
    db: DbSession,
    call_status: CallStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Call]:
    query = select(Call).where(Call.business_id == context.business_id)
    if call_status is not None:
        query = query.where(Call.status == call_status)

    result = await db.execute(query.order_by(Call.started_at.desc()).limit(limit))
    return list(result.scalars().all())


@router.post("", response_model=CallResponse, status_code=status.HTTP_201_CREATED)
async def start_call(
    payload: StartCallRequest,
    context: WritableTenantContext,
    db: DbSession,
    sessions: CallSessions,
    conversations: Conversations,
    llm: LLM,
    embedder: Embedder,
    stt: STT,
    tts: TTS,
    telephony: Telephony,
) -> Call:
    """Begin a call session. Used by inbound webhooks and by the Test Lab."""
    service = _build_service(llm, embedder, stt, tts, telephony, conversations)

    session = await service.start_call(
        db,
        context.business,
        payload.phone_number,
        direction=payload.direction,
        ai_employee_id=payload.ai_employee_id,
        language=payload.language,
    )
    sessions[session.call.id] = session
    return session.call


@router.post("/outbound", response_model=CallResponse, status_code=status.HTTP_201_CREATED)
async def place_outbound_call(
    payload: OutboundCallRequest,
    context: WritableTenantContext,
    db: DbSession,
    sessions: CallSessions,
    conversations: Conversations,
    llm: LLM,
    embedder: Embedder,
    stt: STT,
    tts: TTS,
    telephony: Telephony,
) -> Call:
    service = _build_service(llm, embedder, stt, tts, telephony, conversations)

    try:
        session = await service.place_outbound_call(
            db,
            context.business,
            payload.to_number,
            payload.from_number,
            ai_employee_id=payload.ai_employee_id,
            language=payload.language,
        )
    except CallError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    sessions[session.call.id] = session
    return session.call


@router.get("/{call_id}", response_model=CallDetailResponse)
async def get_call(call_id: uuid.UUID, context: TenantContext, db: DbSession) -> CallDetailResponse:
    result = await db.execute(
        select(Call)
        .options(selectinload(Call.transcripts))
        .where(Call.id == call_id, Call.business_id == context.business_id)
    )
    call = result.scalars().first()
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")

    return CallDetailResponse(
        **CallResponse.model_validate(call).model_dump(),
        transcript=[TranscriptEntry.model_validate(t) for t in call.transcripts],
    )


@router.post("/{call_id}/utterances", response_model=TurnResponse)
async def send_utterance(
    call_id: uuid.UUID,
    payload: CallUtteranceRequest,
    context: WritableTenantContext,
    db: DbSession,
    sessions: CallSessions,
    conversations: Conversations,
    llm: LLM,
    embedder: Embedder,
    stt: STT,
    tts: TTS,
    telephony: Telephony,
) -> TurnResponse:
    """Feed one caller utterance into a live call."""
    from app.api.v1.conversation import _to_turn_response

    await _load_call(db, context.business_id, call_id)
    session = _session_or_404(sessions, call_id)
    service = _build_service(llm, embedder, stt, tts, telephony, conversations)

    try:
        result = await service.handle_utterance(db, session, context.business, payload.text)
    except CallError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return _to_turn_response(result)


@router.post("/{call_id}/consent", response_model=CallResponse)
async def set_recording_consent(
    call_id: uuid.UUID,
    payload: ConsentRequest,
    context: WritableTenantContext,
    db: DbSession,
) -> Call:
    call = await _load_call(db, context.business_id, call_id)
    call.recording_consent = payload.consent

    # Consent withdrawn means the recording must not be retained.
    if payload.consent != "granted":
        call.recording_path = None

    await db.commit()
    await db.refresh(call)
    return call


@router.post("/{call_id}/transfer", response_model=CallResponse)
async def transfer_call(
    call_id: uuid.UUID,
    context: WritableTenantContext,
    db: DbSession,
    sessions: CallSessions,
    conversations: Conversations,
    llm: LLM,
    embedder: Embedder,
    stt: STT,
    tts: TTS,
    telephony: Telephony,
) -> Call:
    await _load_call(db, context.business_id, call_id)
    session = _session_or_404(sessions, call_id)
    service = _build_service(llm, embedder, stt, tts, telephony, conversations)

    await service.transfer_to_human(db, session)
    sessions.pop(call_id, None)
    return session.call


@router.post("/{call_id}/end", response_model=CallResponse)
async def end_call(
    call_id: uuid.UUID,
    payload: EndCallRequest,
    context: WritableTenantContext,
    db: DbSession,
    sessions: CallSessions,
    conversations: Conversations,
    llm: LLM,
    embedder: Embedder,
    stt: STT,
    tts: TTS,
    telephony: Telephony,
) -> Call:
    await _load_call(db, context.business_id, call_id)
    session = _session_or_404(sessions, call_id)
    service = _build_service(llm, embedder, stt, tts, telephony, conversations)

    call = await service.end_call(db, session, status=payload.status, outcome=payload.outcome)
    sessions.pop(call_id, None)
    return call


@router.websocket("/{call_id}/stream")
async def stream_audio(
    websocket: WebSocket,
    business_id: uuid.UUID,
    call_id: uuid.UUID,
    db: DbSession,
    sessions: CallSessions,
    conversations: Conversations,
    llm: LLM,
    embedder: Embedder,
    stt: STT,
    tts: TTS,
    telephony: Telephony,
) -> None:
    """Bidirectional audio for a live call.

    The telephony vendor streams caller audio in; synthesised replies stream
    back out. Binary frames are audio; text frames carry control messages.

    The call is ended on any exit path -- clean hangup, escalation, or a dropped
    connection -- so a transcript and summary always survive.
    """
    from app.models.business import Business

    session = sessions.get(call_id)
    if session is None or session.call.business_id != business_id:
        await websocket.close(code=4404, reason="Call not found")
        return

    business = await db.get(Business, business_id)
    if business is None:
        await websocket.close(code=4404, reason="Business not found")
        return

    await websocket.accept()
    service = _build_service(llm, embedder, stt, tts, telephony, conversations)

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            audio = message.get("bytes")
            if audio is None:
                if message.get("text") == "hangup":
                    break
                continue

            result = await service.handle_audio(db, session, business, audio)

            if result is None:
                # Recognition failed; the caller was asked to repeat.
                await websocket.send_json({"event": "retry"})
                continue

            await websocket.send_json(
                {
                    "event": "reply",
                    "text": result.reply,
                    "language": result.language,
                    "escalated": result.escalated,
                }
            )

            spoken = await service.engine.speak(result.reply, result.language)
            if spoken is not None:
                await websocket.send_bytes(spoken.data)

            if result.escalated:
                break

    except WebSocketDisconnect:
        pass
    finally:
        await service.end_call(db, session, status=CallStatus.COMPLETED)
        sessions.pop(call_id, None)
