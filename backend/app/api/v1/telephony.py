"""Telephony webhooks.

Vendors post here when a call rings, answers, or ends. The route is keyed by
business so a single deployment can serve many tenants, and payloads are
normalised through the provider so vendor-specific field names stay in one place.
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import (
    LLM,
    STT,
    TTS,
    CallSessions,
    Conversations,
    DbSession,
    Embedder,
    Telephony,
)
from app.models.business import Business
from app.models.call import Call
from app.models.enums import CallDirection, CallOutcome, CallStatus, RecordingConsent
from app.providers.base import ProviderError
from app.schemas.call import TelephonyWebhookResponse
from app.services.call import CallService
from app.services.conversation import ConversationEngine

router = APIRouter(prefix="/telephony", tags=["telephony"])

# Vendor status values mapped onto our call lifecycle.
COMPLETED_EVENTS = {"completed", "call-completed", "hangup", "ended"}
FAILED_EVENTS = {"failed", "canceled", "cancelled"}
NO_ANSWER_EVENTS = {"no-answer", "noanswer", "timeout"}
BUSY_EVENTS = {"busy"}
ANSWERED_EVENTS = {"answered", "in-progress", "inprogress", "start", "ringing"}


async def _read_payload(request: Request) -> dict[str, Any]:
    """Accept JSON or form-encoded webhooks; vendors differ."""
    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        try:
            return await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Malformed JSON payload") from exc

    form = await request.form()
    return {key: str(value) for key, value in form.items()}


@router.post(
    "/{business_id}/incoming",
    response_model=TelephonyWebhookResponse,
)
async def incoming_call(
    business_id: uuid.UUID,
    request: Request,
    db: DbSession,
    sessions: CallSessions,
    conversations: Conversations,
    llm: LLM,
    embedder: Embedder,
    stt: STT,
    tts: TTS,
    telephony: Telephony,
) -> TelephonyWebhookResponse:
    """Handle a ringing inbound call by opening a session and greeting."""
    payload = await _read_payload(request)

    business = await db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    try:
        event = telephony.parse_webhook(payload)
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc

    existing = await db.execute(
        select(Call).where(
            Call.business_id == business_id,
            Call.provider_call_id == event.provider_call_id,
        )
    )
    if (already := existing.scalars().first()) is not None:
        # Vendors retry webhooks; a duplicate must not start a second call.
        return TelephonyWebhookResponse(received=True, call_id=already.id, action="already_started")

    engine = ConversationEngine(llm=llm, embedder=embedder, stt=stt, tts=tts)
    service = CallService(engine=engine, store=conversations, telephony=telephony)

    session = await service.start_call(
        db,
        business,
        event.from_number or "unknown",
        direction=CallDirection.INBOUND,
        provider_call_id=event.provider_call_id,
    )
    sessions[session.call.id] = session

    return TelephonyWebhookResponse(received=True, call_id=session.call.id, action="answered")


@router.post("/{business_id}/status", response_model=TelephonyWebhookResponse)
async def call_status(
    business_id: uuid.UUID,
    request: Request,
    db: DbSession,
    sessions: CallSessions,
    conversations: Conversations,
    llm: LLM,
    embedder: Embedder,
    stt: STT,
    tts: TTS,
    telephony: Telephony,
) -> TelephonyWebhookResponse:
    """Apply a lifecycle event to an existing call."""
    payload = await _read_payload(request)

    try:
        event = telephony.parse_webhook(payload)
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc

    result = await db.execute(
        select(Call).where(
            Call.business_id == business_id,
            Call.provider_call_id == event.provider_call_id,
        )
    )
    call = result.scalars().first()
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")

    if event.event in ANSWERED_EVENTS and call.status == CallStatus.RINGING:
        call.status = CallStatus.IN_PROGRESS
        await db.commit()
        return TelephonyWebhookResponse(received=True, call_id=call.id, action="in_progress")

    terminal = None
    if event.event in COMPLETED_EVENTS:
        terminal = CallStatus.COMPLETED
    elif event.event in NO_ANSWER_EVENTS:
        terminal = CallStatus.NO_ANSWER
    elif event.event in BUSY_EVENTS:
        terminal = CallStatus.BUSY
    elif event.event in FAILED_EVENTS:
        terminal = CallStatus.FAILED

    if terminal is None:
        return TelephonyWebhookResponse(received=True, call_id=call.id, action="ignored")

    if event.duration_seconds:
        call.duration_seconds = event.duration_seconds

    # Only retain a recording the caller agreed to.
    if event.recording_url and call.recording_consent == RecordingConsent.GRANTED:
        call.recording_path = event.recording_url

    session = sessions.pop(call.id, None)
    if session is not None:
        engine = ConversationEngine(llm=llm, embedder=embedder, stt=stt, tts=tts)
        service = CallService(engine=engine, store=conversations, telephony=telephony)
        outcome = None if terminal is CallStatus.COMPLETED else CallOutcome.DROPPED
        await service.end_call(db, session, status=terminal, outcome=outcome)
    else:
        call.status = terminal
        if call.outcome is None and terminal is not CallStatus.COMPLETED:
            call.outcome = CallOutcome.DROPPED
        await db.commit()

    return TelephonyWebhookResponse(received=True, call_id=call.id, action=terminal.value)
