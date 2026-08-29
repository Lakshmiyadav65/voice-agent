"""Call lifecycle.

Owns a phone call from ring to summary: creating the record, driving each turn
through the conversation engine, persisting the transcript as it happens, and
closing the call with an honest outcome.

Transcripts are written turn by turn rather than at the end, so a call that
drops mid-way still leaves a reviewable record.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.call import Call, CallTranscript
from app.models.crm import Customer
from app.models.enums import (
    CallDirection,
    CallOutcome,
    CallStatus,
    EscalationReason,
    Language,
    RecordingConsent,
    ToolName,
    ToolStatus,
    TurnRole,
)
from app.providers.base import ProviderError, TelephonyProvider
from app.services.conversation import ConversationEngine, TurnResult
from app.services.conversation_state import Conversation, ConversationStore

# Statuses that mean the call never actually connected.
UNCONNECTED = {CallStatus.NO_ANSWER, CallStatus.BUSY, CallStatus.FAILED}

CONSENT_PROMPTS = {
    Language.ENGLISH: "This call may be recorded for quality purposes. Is that alright?",
    Language.TANGLISH: "Ee call quality kosam record cheyyavacchu. Parledha?",
    Language.TELUGU: "ఈ కాల్ నాణ్యత కోసం రికార్డ్ చేయవచ్చు. పర్వాలేదా?",
}

STT_RETRY_PROMPTS = {
    Language.ENGLISH: "Sorry, I didn't catch that. Could you say it again?",
    Language.TANGLISH: "Sorry, sarigga vinipinchaledu. Marokasari cheppagalara?",
    Language.TELUGU: "క్షమించండి, సరిగ్గా వినిపించలేదు. మరోసారి చెప్పగలరా?",
}


class CallError(Exception):
    pass


@dataclass
class CallSession:
    """A live call and the conversation running inside it.

    A session outlives the request that created it, so the `Call` instance it
    holds belongs to a closed database session. Every operation re-binds it to
    the active session before touching it.
    """

    call: Call
    conversation: Conversation
    sequence: int = 0

    @property
    def call_id(self) -> uuid.UUID:
        return self.call.id

    @property
    def business_id(self) -> uuid.UUID:
        return self.call.business_id


async def _bind(db: AsyncSession, session: CallSession) -> Call:
    """Re-attach the session's call to the current database session."""
    if session.call in db:
        return session.call

    call = await db.get(Call, session.call.id)
    if call is None:
        raise CallError("Call record no longer exists")

    session.call = call
    return call


def _normalize_phone(raw: str) -> str:
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return raw.strip()[:20]
    return digits[-12:] if digits.startswith("91") else digits[-10:]


class CallService:
    def __init__(
        self,
        engine: ConversationEngine,
        store: ConversationStore,
        telephony: TelephonyProvider | None = None,
    ) -> None:
        self.engine = engine
        self.store = store
        self.telephony = telephony

    async def _get_or_create_customer(
        self, db: AsyncSession, business_id: uuid.UUID, phone: str
    ) -> Customer:
        result = await db.execute(
            select(Customer).where(Customer.business_id == business_id, Customer.phone == phone)
        )
        customer = result.scalars().first()

        if customer is None:
            customer = Customer(business_id=business_id, phone=phone)
            db.add(customer)
            await db.flush()

        return customer

    async def start_call(
        self,
        db: AsyncSession,
        business: Business,
        phone_number: str,
        direction: CallDirection = CallDirection.INBOUND,
        provider_call_id: str | None = None,
        ai_employee_id: uuid.UUID | None = None,
        language: Language = Language.ENGLISH,
    ) -> CallSession:
        phone = _normalize_phone(phone_number)
        customer = await self._get_or_create_customer(db, business.id, phone)

        call = Call(
            business_id=business.id,
            ai_employee_id=ai_employee_id,
            customer_id=customer.id,
            direction=direction,
            phone_number=phone,
            provider_call_id=provider_call_id,
            provider=self.telephony.name if self.telephony else None,
            status=CallStatus.IN_PROGRESS,
            started_at=datetime.now(UTC),
            language=language,
        )
        db.add(call)
        await db.commit()
        await db.refresh(call)

        conversation = self.store.create(business.id, ai_employee_id)
        conversation.language = language
        conversation.slots.phone = phone

        session = CallSession(call=call, conversation=conversation)

        greeting = self.engine.greet(conversation, business)
        await self._record(db, session, TurnRole.AI, greeting, language)

        return session

    async def place_outbound_call(
        self,
        db: AsyncSession,
        business: Business,
        to_number: str,
        from_number: str,
        ai_employee_id: uuid.UUID | None = None,
        language: Language = Language.ENGLISH,
    ) -> CallSession:
        if self.telephony is None:
            raise CallError("No telephony provider is configured")

        try:
            provider_call_id = await self.telephony.initiate_call(to_number, from_number)
        except ProviderError as exc:
            # Record the attempt so a failed dial is visible, not lost.
            phone = _normalize_phone(to_number)
            customer = await self._get_or_create_customer(db, business.id, phone)
            failed = Call(
                business_id=business.id,
                ai_employee_id=ai_employee_id,
                customer_id=customer.id,
                direction=CallDirection.OUTBOUND,
                phone_number=phone,
                provider=self.telephony.name,
                status=CallStatus.FAILED,
                error=exc.message,
                started_at=datetime.now(UTC),
                ended_at=datetime.now(UTC),
            )
            db.add(failed)
            await db.commit()
            raise CallError(exc.message) from exc

        return await self.start_call(
            db,
            business,
            to_number,
            direction=CallDirection.OUTBOUND,
            provider_call_id=provider_call_id,
            ai_employee_id=ai_employee_id,
            language=language,
        )

    async def _record(
        self,
        db: AsyncSession,
        session: CallSession,
        speaker: TurnRole,
        text: str,
        language: Language,
        metadata: dict | None = None,
    ) -> CallTranscript:
        session.sequence += 1
        entry = CallTranscript(
            call_id=session.call_id,
            sequence=session.sequence,
            speaker=speaker,
            text=text,
            language=language,
            spoken_at=datetime.now(UTC),
            transcript_metadata=metadata or {},
        )
        db.add(entry)
        await db.commit()
        return entry

    async def handle_audio(
        self,
        db: AsyncSession,
        session: CallSession,
        business: Business,
        audio: bytes,
    ) -> TurnResult | None:
        """Transcribe caller audio and run a turn.

        A recogniser failure returns None after asking the caller to repeat;
        guessing at unheard speech would be worse than asking again.
        """
        try:
            transcript = await self.engine.transcribe(audio, session.conversation.language)
        except ProviderError as exc:
            prompt = STT_RETRY_PROMPTS.get(
                session.conversation.language, STT_RETRY_PROMPTS[Language.ENGLISH]
            )
            escalate = session.conversation.record_failure()
            await self._record(
                db,
                session,
                TurnRole.AI,
                prompt,
                session.conversation.language,
                {"stt_error": exc.message},
            )
            if escalate:
                await self.end_call(
                    db,
                    session,
                    status=CallStatus.TRANSFERRED,
                    outcome=CallOutcome.TRANSFERRED_TO_HUMAN,
                    escalation_reason=EscalationReason.PROVIDER_FAILURE,
                )
            return None

        return await self.handle_utterance(db, session, business, transcript.text)

    async def handle_utterance(
        self,
        db: AsyncSession,
        session: CallSession,
        business: Business,
        text: str,
    ) -> TurnResult:
        call = await _bind(db, session)

        if call.status not in (CallStatus.IN_PROGRESS, CallStatus.RINGING):
            raise CallError(f"Call is {call.status}")

        consent = self._read_consent(text)
        if consent is not None and call.recording_consent == RecordingConsent.NOT_ASKED:
            call.recording_consent = consent
            await db.commit()

        result = await self.engine.handle_turn(db, session.conversation, business, text)

        await self._record(
            db, session, TurnRole.CUSTOMER, text, result.language, {"intent": result.intent}
        )
        await self._record(
            db,
            session,
            TurnRole.AI,
            result.reply,
            result.language,
            {
                "source": result.source,
                "blocked": result.blocked,
                "violations": [v.kind for v in result.violations],
                "tools": [{"tool": call.tool, "status": call.status} for call in result.tool_calls],
                "knowledge_sources": result.knowledge_sources,
            },
        )

        call.language = result.language
        await self._link_tool_effects(db, session, result)

        if result.escalated:
            await self.transfer_to_human(db, session, result.escalation_reason)

        await db.commit()
        return result

    async def _link_tool_effects(
        self, db: AsyncSession, session: CallSession, result: TurnResult
    ) -> None:
        """Attach records the tools created so the call links to its outcomes."""
        call = await _bind(db, session)

        for tool_call in result.tool_calls:
            if tool_call.status is not ToolStatus.SUCCESS:
                continue

            if tool_call.tool is ToolName.CREATE_LEAD and tool_call.data.get("lead_id"):
                call.lead_id = uuid.UUID(tool_call.data["lead_id"])
            elif tool_call.tool is ToolName.BOOK_APPOINTMENT:
                call.outcome = CallOutcome.APPOINTMENT_BOOKED
            elif tool_call.tool in (
                ToolName.SEND_WHATSAPP,
                ToolName.SEND_BROCHURE,
                ToolName.SEND_LOCATION,
            ):
                call.outcome = CallOutcome.INFORMATION_SENT

    def _read_consent(self, text: str) -> RecordingConsent | None:
        lowered = text.lower()
        if any(word in lowered for word in ("no recording", "don't record", "do not record")):
            return RecordingConsent.DECLINED
        return None

    def ask_recording_consent(self, session: CallSession) -> str:
        return CONSENT_PROMPTS.get(session.conversation.language, CONSENT_PROMPTS[Language.ENGLISH])

    async def attach_recording(self, db: AsyncSession, session: CallSession, path: str) -> bool:
        """Store a recording only where consent was granted."""
        call = await _bind(db, session)

        if call.recording_consent != RecordingConsent.GRANTED:
            return False

        call.recording_path = path
        await db.commit()
        return True

    async def transfer_to_human(
        self,
        db: AsyncSession,
        session: CallSession,
        reason: EscalationReason | None = None,
        to_number: str | None = None,
    ) -> None:
        call = await _bind(db, session)

        if self.telephony is not None and call.provider_call_id and to_number:
            try:
                await self.telephony.transfer(call.provider_call_id, to_number)
            except ProviderError as exc:
                call.error = exc.message

        await self.end_call(
            db,
            session,
            status=CallStatus.TRANSFERRED,
            outcome=CallOutcome.TRANSFERRED_TO_HUMAN,
            escalation_reason=reason,
        )

    async def end_call(
        self,
        db: AsyncSession,
        session: CallSession,
        status: CallStatus = CallStatus.COMPLETED,
        outcome: CallOutcome | None = None,
        escalation_reason: EscalationReason | None = None,
    ) -> Call:
        call = await _bind(db, session)

        if call.ended_at is not None:
            return call

        call.ended_at = datetime.now(UTC)
        call.status = status

        # A duration reported by the telephony vendor is authoritative: it
        # measured the actual connected time. Only fall back to our own clock.
        if call.duration_seconds == 0 and call.started_at is not None:
            started = call.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=UTC)
            call.duration_seconds = max(int((call.ended_at - started).total_seconds()), 0)

        if escalation_reason is not None:
            call.escalation_reason = escalation_reason

        if outcome is not None:
            call.outcome = outcome
        elif call.outcome is None:
            call.outcome = self._infer_outcome(session)

        call.summary = await build_summary(db, call)
        session.conversation.end()
        self.store.delete(session.conversation.id)

        await db.commit()
        await db.refresh(call)
        return call

    def _infer_outcome(self, session: CallSession) -> CallOutcome:
        conversation = session.conversation

        if conversation.slots.is_qualified:
            return CallOutcome.QUALIFIED_LEAD
        if conversation.turn_count <= 1:
            return CallOutcome.DROPPED
        if conversation.consecutive_failures > 0:
            return CallOutcome.NO_RESOLUTION
        return CallOutcome.ANSWERED


async def build_summary(db: AsyncSession, call: Call) -> str:
    """Compose a factual summary from what the call actually contains.

    Deliberately assembled from stored facts rather than generated by a model,
    so a summary can never assert something the call did not.
    """
    result = await db.execute(
        select(CallTranscript)
        .where(CallTranscript.call_id == call.id)
        .order_by(CallTranscript.sequence)
    )
    turns = list(result.scalars().all())

    customer_turns = [t for t in turns if t.speaker == TurnRole.CUSTOMER]
    ai_turns = [t for t in turns if t.speaker == TurnRole.AI]

    lines = [
        f"{call.direction.capitalize()} call with {call.phone_number}, "
        f"{call.duration_seconds}s, {len(customer_turns)} caller turns."
    ]

    sources = {
        t.transcript_metadata.get("source") for t in ai_turns if t.transcript_metadata.get("source")
    }
    if sources:
        lines.append("Sources used: " + ", ".join(sorted(sources)) + ".")

    tools_used = sorted(
        {
            tool["tool"]
            for t in ai_turns
            for tool in t.transcript_metadata.get("tools", [])
            if tool.get("status") == ToolStatus.SUCCESS
        }
    )
    if tools_used:
        lines.append("Actions taken: " + ", ".join(tools_used) + ".")

    blocked = sum(1 for t in ai_turns if t.transcript_metadata.get("blocked"))
    if blocked:
        lines.append(f"{blocked} reply(ies) blocked by guardrails.")

    if call.escalation_reason:
        lines.append(f"Escalated to a human: {call.escalation_reason}.")

    if call.outcome:
        lines.append(f"Outcome: {call.outcome}.")

    return " ".join(lines)


async def count_calls(db: AsyncSession, business_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(Call).where(Call.business_id == business_id)
    )
    return int(result.scalar_one())
