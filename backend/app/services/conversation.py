"""The conversation engine.

One turn runs:

    transcribe -> detect language -> retrieve business data -> build context
    -> generate -> guardrail -> update state -> synthesize

Retrieval happens before generation, so the model is handed the facts rather
than asked to recall them. The guardrail runs after generation, so nothing the
model invents can reach the caller.
"""

import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.enums import (
    ConversationState,
    EscalationReason,
    Intent,
    Language,
    RouteSource,
    ToolName,
    TurnRole,
)
from app.providers.base import (
    Audio,
    LLMProvider,
    ProviderError,
    STTProvider,
    Transcript,
    TTSProvider,
    WhatsAppProvider,
)
from app.providers.embeddings import EmbeddingProvider
from app.services import business_brain, guardrails, knowledge
from app.services.context import build_turn_context
from app.services.conversation_state import Conversation
from app.services.guardrails import GroundingSet
from app.services.language import choose_reply_language, detect_language
from app.services.router import RoutingDecision, route
from app.services.tools import ToolExecutor, ToolResult

GREETINGS = {
    Language.ENGLISH: "Hello! Thank you for calling {business_name}. How can I help you today?",
    Language.TANGLISH: "Namaskaram! {business_name} ki call chesinanduku thanks. Cheppandi, "
    "meeku ela help cheyyagalanu?",
    Language.TELUGU: "నమస్కారం! {business_name} కి కాల్ చేసినందుకు ధన్యవాదాలు. నేను మీకు ఎలా సహాయం చేయగలను?",
}

PROVIDER_FAILURE_MESSAGES = {
    Language.ENGLISH: (
        "I'm having trouble on my side right now. Let me pass you to someone from the team."
    ),
    Language.TANGLISH: (
        "Naa vaipu nunchi konchem problem vachindi. Team lo evarikaina connect chestanu."
    ),
    Language.TELUGU: ("నా వైపు నుండి కొంచెం సమస్య వచ్చింది. టీమ్ నుండి ఎవరికైనా కలుపుతాను."),
}

# Words that suggest the caller is asking about the catalogue rather than chatting.
PRODUCT_QUERY_HINTS = re.compile(
    r"\b(?:price|cost|rate|stock|available|availability|entha|enta|undha|unda|"
    r"kavali|models?|buy|purchase)\b",
    re.IGNORECASE,
)

BUDGET_PATTERN = re.compile(
    r"(?:budget|under|below|within|max(?:imum)?)\s*(?:is|of)?\s*"
    r"(?:₹|rs\.?|inr)?\s*([\d,]+)",
    re.IGNORECASE,
)

# The TRD routes product and price questions to structured data, not the
# knowledge base. A passage must be strongly relevant before it is allowed to
# stand in for a catalogue lookup that found nothing.
STRONG_KNOWLEDGE_SCORE = 0.35


@dataclass
class TurnResult:
    """Everything produced by one exchange, for the caller and for review."""

    conversation_id: uuid.UUID
    reply: str
    language: Language
    state: ConversationState
    transcript: str
    grounding: GroundingSet = field(default_factory=GroundingSet)
    violations: list[guardrails.Violation] = field(default_factory=list)
    escalated: bool = False
    escalation_reason: EscalationReason | None = None
    knowledge_sources: list[dict] = field(default_factory=list)
    product_found: bool | None = None
    audio: Audio | None = None
    blocked: bool = False
    intent: Intent = Intent.UNKNOWN
    source: RouteSource = RouteSource.NONE
    routing_reason: str = ""
    tool_calls: list[ToolResult] = field(default_factory=list)


class ConversationEngine:
    def __init__(
        self,
        llm: LLMProvider,
        embedder: EmbeddingProvider,
        stt: STTProvider | None = None,
        tts: TTSProvider | None = None,
        whatsapp: WhatsAppProvider | None = None,
    ) -> None:
        self.llm = llm
        self.embedder = embedder
        self.stt = stt
        self.tts = tts
        self.whatsapp = whatsapp

    async def transcribe(self, audio: bytes, language: Language | None = None) -> Transcript:
        if self.stt is None:
            raise ProviderError("stt", "No speech recogniser configured")
        return await self.stt.transcribe(audio, language)

    def greet(self, conversation: Conversation, business: Business) -> str:
        template = GREETINGS.get(conversation.language, GREETINGS[Language.ENGLISH])
        greeting = template.format(business_name=business.name)
        conversation.add_turn(TurnRole.AI, greeting, conversation.language)
        conversation.advance(ConversationState.UNDERSTANDING)
        return greeting

    def _extract_slots(self, conversation: Conversation, text: str, product_name: str | None):
        updates: dict[str, str] = {}

        if product_name:
            updates["product_interest"] = product_name

        budget = BUDGET_PATTERN.search(text)
        if budget:
            updates["budget"] = budget.group(1).replace(",", "")

        if updates:
            conversation.slots.update(**updates)

    async def _matched_product_name(
        self, db: AsyncSession, business_id: uuid.UUID, text: str
    ) -> str | None:
        """Find a catalogue name mentioned in the utterance.

        Exact matching from Phase 3 is preserved: the utterance must contain the
        full catalogue name, so 'iPhone' alone still resolves to nothing.
        """
        names = await business_brain.list_product_names(db, business_id)
        lowered = text.lower()

        matches = [name for name in names if name.lower() in lowered]
        if not matches:
            return None

        # Prefer the longest match so "iPhone 15 Pro" wins over "iPhone 15".
        return max(matches, key=len)

    async def _find_product(self, db: AsyncSession, business_id: uuid.UUID, text: str):
        name = await self._matched_product_name(db, business_id, text)
        if name is None:
            return None
        return await business_brain.find_product(db, business_id, name)

    async def _run_tools(
        self,
        executor: ToolExecutor,
        decision: RoutingDecision,
        customer_text: str,
        product_name: str | None,
        conversation: Conversation,
    ) -> list[ToolResult]:
        """Execute the tools the router selected.

        Read-only tools run automatically. Tools that write or send need details
        the caller has not necessarily given yet, so they run only once their
        required arguments are actually available -- an appointment is never
        booked from a half-heard request.
        """
        results: list[ToolResult] = []

        for tool in decision.tools:
            if tool in (ToolName.FIND_PRODUCT, ToolName.CHECK_INVENTORY):
                if product_name is None:
                    continue
                results.append(await executor.run(tool, {"product_name": product_name}))

            elif tool is ToolName.SEARCH_KNOWLEDGE:
                results.append(await executor.run(tool, {"query": customer_text}))

            elif tool is ToolName.CHECK_AVAILABILITY:
                results.append(await executor.run(tool, {"when": customer_text}))

            elif tool is ToolName.BOOK_APPOINTMENT:
                availability = next(
                    (r for r in results if r.tool is ToolName.CHECK_AVAILABILITY), None
                )
                phone = conversation.slots.phone
                if (
                    phone
                    and availability is not None
                    and availability.ok
                    and availability.data.get("available")
                ):
                    results.append(
                        await executor.run(tool, {"when": customer_text, "phone": phone})
                    )

            elif tool in (
                ToolName.SEND_WHATSAPP,
                ToolName.SEND_BROCHURE,
                ToolName.SEND_LOCATION,
            ):
                phone = conversation.slots.phone
                if phone is None:
                    continue
                arguments: dict = {"phone": phone}
                if tool is ToolName.SEND_WHATSAPP:
                    arguments["message"] = customer_text
                if tool is ToolName.SEND_BROCHURE:
                    if product_name is None:
                        continue
                    arguments["product_name"] = product_name
                results.append(await executor.run(tool, arguments))

            elif tool is ToolName.CREATE_LEAD:
                phone = conversation.slots.phone
                if phone is None:
                    continue
                results.append(
                    await executor.run(
                        tool,
                        {
                            "phone": phone,
                            "name": conversation.slots.customer_name,
                            "requirement": conversation.slots.requirement
                            or conversation.slots.product_interest,
                            "budget": conversation.slots.budget,
                        },
                    )
                )

            elif tool is ToolName.TRANSFER_TO_HUMAN:
                results.append(await executor.run(tool, {"reason": decision.intent.value}))

        return results

    async def handle_turn(
        self,
        db: AsyncSession,
        conversation: Conversation,
        business: Business,
        customer_text: str,
    ) -> TurnResult:
        detected = detect_language(customer_text)
        reply_language = choose_reply_language(detected, conversation.language)
        conversation.language = reply_language

        conversation.add_turn(
            TurnRole.CUSTOMER,
            customer_text,
            detected.language,
            code_switched=detected.code_switched,
        )

        if guardrails.customer_requested_human(customer_text):
            return self._escalate(
                conversation,
                reply_language,
                customer_text,
                EscalationReason.CUSTOMER_REQUEST,
            )

        # Route first: the source for a fact is decided before anything is
        # fetched, so the answer cannot drift to whichever source happened to
        # return something.
        product_name = await self._matched_product_name(db, business.id, customer_text)
        decision = route(customer_text, has_product_mention=product_name is not None)

        self._extract_slots(conversation, customer_text, product_name)
        if product_name is None and conversation.slots.product_interest:
            product_name = conversation.slots.product_interest

        executor = ToolExecutor(
            db,
            business.id,
            embedder=self.embedder,
            whatsapp=self.whatsapp,
            timezone=business.timezone,
        )
        tool_calls = await self._run_tools(
            executor, decision, customer_text, product_name, conversation
        )

        if decision.source is RouteSource.HUMAN:
            result = self._escalate(
                conversation,
                reply_language,
                customer_text,
                EscalationReason.CUSTOMER_REQUEST,
            )
            result.intent = decision.intent
            result.source = decision.source
            result.routing_reason = decision.reason
            result.tool_calls = tool_calls
            return result

        product_result = None
        if decision.needs_structured_data or conversation.slots.product_interest:
            product_result = await self._find_product(db, business.id, customer_text)
            if product_result is None and product_name:
                product_result = await business_brain.find_product(db, business.id, product_name)

        knowledge_hits = await knowledge.search_knowledge(
            db,
            self.embedder,
            business_id=business.id,
            query=customer_text,
        )

        rules = await business_brain.get_active_rules(db, business.id)

        context = build_turn_context(
            conversation,
            business_name=business.name,
            customer_text=customer_text,
            reply_language=reply_language,
            product_result=product_result,
            knowledge_hits=knowledge_hits,
            rules=rules,
        )

        # A catalogue question the router sent to structured data, which then
        # resolved nothing, is answered honestly here. A weakly related policy
        # passage must not be offered as if it were the answer.
        asked_about_product = decision.needs_structured_data
        product_missing = product_result is None or not product_result.found
        knowledge_answers_it = any(hit.score >= STRONG_KNOWLEDGE_SCORE for hit in knowledge_hits)

        if asked_about_product and product_missing and not knowledge_answers_it:
            reply = guardrails.unknown_product_response(reply_language)
            conversation.add_turn(TurnRole.AI, reply, reply_language)
            escalate = conversation.record_failure()
            conversation.advance(ConversationState.ANSWERING)

            if escalate:
                conversation.escalate(EscalationReason.REPEATED_FAILURE)

            return TurnResult(
                conversation_id=conversation.id,
                reply=reply,
                language=reply_language,
                state=conversation.state,
                transcript=customer_text,
                grounding=context.grounding,
                escalated=escalate,
                escalation_reason=conversation.escalation_reason,
                product_found=False,
                intent=decision.intent,
                source=decision.source,
                routing_reason=decision.reason,
                tool_calls=tool_calls,
            )

        try:
            generated = await self.llm.generate(context.messages)
        except ProviderError:
            return self._provider_failure(conversation, reply_language, customer_text)

        verdict = guardrails.enforce(generated.content, context.grounding, reply_language)

        conversation.add_turn(
            TurnRole.AI,
            verdict.response,
            reply_language,
            blocked=verdict.blocked,
            violations=[v.kind for v in verdict.violations],
        )

        if verdict.blocked:
            conversation.escalate(EscalationReason.UNGROUNDED_ANSWER)
        else:
            conversation.record_success()
            conversation.advance(
                ConversationState.QUALIFYING
                if not conversation.slots.is_qualified
                else ConversationState.ANSWERING
            )

        return TurnResult(
            conversation_id=conversation.id,
            reply=verdict.response,
            language=reply_language,
            state=conversation.state,
            transcript=customer_text,
            grounding=context.grounding,
            violations=verdict.violations,
            escalated=verdict.escalate,
            escalation_reason=conversation.escalation_reason,
            blocked=verdict.blocked,
            product_found=(
                product_result.found
                if product_result is not None
                else (False if asked_about_product else None)
            ),
            knowledge_sources=[
                {
                    "document_id": str(hit.document_id),
                    "document_name": hit.document_name,
                    "chunk_index": hit.chunk_index,
                    "score": hit.score,
                }
                for hit in knowledge_hits
            ],
            intent=decision.intent,
            source=decision.source,
            routing_reason=decision.reason,
            tool_calls=tool_calls,
        )

    def _escalate(
        self,
        conversation: Conversation,
        language: Language,
        transcript: str,
        reason: EscalationReason,
    ) -> TurnResult:
        reply = guardrails.fallback_response(language)
        conversation.add_turn(TurnRole.AI, reply, language)
        conversation.escalate(reason)

        return TurnResult(
            conversation_id=conversation.id,
            reply=reply,
            language=language,
            state=conversation.state,
            transcript=transcript,
            escalated=True,
            escalation_reason=reason,
        )

    def _provider_failure(
        self, conversation: Conversation, language: Language, transcript: str
    ) -> TurnResult:
        """Never pretend a failed turn succeeded."""
        reply = PROVIDER_FAILURE_MESSAGES.get(language, PROVIDER_FAILURE_MESSAGES[Language.ENGLISH])
        conversation.add_turn(TurnRole.AI, reply, language, provider_failure=True)
        conversation.escalate(EscalationReason.PROVIDER_FAILURE)

        return TurnResult(
            conversation_id=conversation.id,
            reply=reply,
            language=language,
            state=conversation.state,
            transcript=transcript,
            escalated=True,
            escalation_reason=EscalationReason.PROVIDER_FAILURE,
        )

    async def speak(self, text: str, language: Language) -> Audio | None:
        if self.tts is None:
            return None
        return await self.tts.synthesize(text, language)
