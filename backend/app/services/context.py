"""Assemble the prompt context for a turn.

Business facts are injected as retrieved data, never baked into instructions.
The instruction block tells the model how to converse; the context block tells
it what is true right now. Changing a price changes the context, not the prompt.
"""

from dataclasses import dataclass, field
from decimal import Decimal

from app.models.business_brain import BusinessRule
from app.models.enums import Language
from app.providers.base import LLMMessage
from app.services.conversation_state import Conversation
from app.services.guardrails import GroundingSet
from app.services.knowledge import RetrievedChunk

LANGUAGE_INSTRUCTIONS = {
    Language.ENGLISH: "Reply in clear, natural English.",
    Language.TELUGU: "Reply in natural Telugu, as a local shop assistant would speak.",
    Language.TANGLISH: (
        "Reply in Tanglish: conversational Telugu written in Latin script, "
        "keeping English words for product names, numbers, and technical terms, "
        "exactly as people speak on the phone."
    ),
}

BASE_INSTRUCTIONS = """You are a voice assistant employed by {business_name}.

Rules you must follow without exception:
- State prices, stock figures, and policies only when they appear in the
  Retrieved Business Data below. Never estimate, round, or recall them.
- If the data needed to answer is missing, say you do not have it confirmed and
  offer to connect the caller to the team.
- Never promise anything the business has not stated.
- Keep replies short and spoken; this is a phone call, not a document.
{language_instruction}"""


@dataclass
class TurnContext:
    """Everything assembled for one model call, plus its grounding set."""

    messages: list[LLMMessage] = field(default_factory=list)
    grounding: GroundingSet = field(default_factory=GroundingSet)
    has_business_data: bool = False


def _format_product_facts(product_result) -> tuple[list[str], GroundingSet]:
    """Render a structured lookup into prompt lines and grounded values."""
    grounding = GroundingSet()
    lines: list[str] = []

    if product_result is None or not product_result.found or product_result.product is None:
        return lines, grounding

    product = product_result.product
    grounding.product_names.add(product.name)
    lines.append(f"Product: {product.name}" + (f" ({product.brand})" if product.brand else ""))

    for view in product_result.variants:
        variant_line = f"  Variant {view.variant.variant_name}:"

        if view.price.found and view.price.price is not None:
            amount: Decimal = view.price.price
            grounding.add_price(amount)
            variant_line += f" price {view.price.currency} {amount}"
        else:
            variant_line += " price not available"

        if view.stock.found:
            grounding.add_quantity(view.stock.quantity)
            variant_line += f", stock {view.stock.quantity} units"
        else:
            variant_line += ", stock not recorded"

        lines.append(variant_line)

    return lines, grounding


def _format_rules(rules: list[BusinessRule]) -> list[str]:
    return [f"- {rule.name} ({rule.rule_type})" for rule in rules]


def build_turn_context(
    conversation: Conversation,
    business_name: str,
    customer_text: str,
    reply_language: Language,
    product_result=None,
    knowledge_hits: list[RetrievedChunk] | None = None,
    rules: list[BusinessRule] | None = None,
) -> TurnContext:
    grounding = GroundingSet()
    data_lines: list[str] = []

    product_lines, product_grounding = _format_product_facts(product_result)
    if product_lines:
        data_lines.append("Structured data:")
        data_lines.extend(product_lines)
        grounding.prices |= product_grounding.prices
        grounding.quantities |= product_grounding.quantities
        grounding.product_names |= product_grounding.product_names

    for hit in knowledge_hits or []:
        if not data_lines:
            data_lines.append("Knowledge base:")
        elif "Knowledge base:" not in data_lines:
            data_lines.append("Knowledge base:")
        data_lines.append(f"  [{hit.document_name} #{hit.chunk_index}] {hit.content}")
        grounding.knowledge_passages.append(hit.content)

        # Figures quoted inside a retrieved passage are themselves grounded.
        from app.services.guardrails import extract_money_amounts, extract_quantities

        grounding.prices |= extract_money_amounts(hit.content)
        grounding.quantities |= extract_quantities(hit.content)

    instructions = BASE_INSTRUCTIONS.format(
        business_name=business_name,
        language_instruction=LANGUAGE_INSTRUCTIONS.get(
            reply_language, LANGUAGE_INSTRUCTIONS[Language.ENGLISH]
        ),
    )

    messages = [LLMMessage(role="system", content=instructions)]

    rule_lines = _format_rules(rules or [])
    if rule_lines:
        messages.append(
            LLMMessage(role="system", content="Business rules:\n" + "\n".join(rule_lines))
        )

    known = conversation.slots.as_dict()
    if known:
        summary = ", ".join(f"{key}={value}" for key, value in known.items())
        messages.append(LLMMessage(role="system", content=f"Known about this caller: {summary}"))

    for turn in conversation.recent_turns():
        role = "user" if turn.role.value == "customer" else "assistant"
        messages.append(LLMMessage(role=role, content=turn.text))

    if data_lines:
        messages.append(
            LLMMessage(
                role="system",
                content="Retrieved Business Data:\n" + "\n".join(data_lines),
            )
        )
    else:
        messages.append(
            LLMMessage(
                role="system",
                content=(
                    "Retrieved Business Data: none. You have no business facts for this question."
                ),
            )
        )

    messages.append(LLMMessage(role="user", content=customer_text))

    return TurnContext(
        messages=messages,
        grounding=grounding,
        has_business_data=bool(data_lines),
    )
