"""Response guardrails.

The product promise is that the AI never invents a business fact. The model is
free to phrase things naturally, but every price, quantity, and policy statement
it makes must trace back to something retrieved from the Business Brain.

This module treats the model's output as untrusted. It extracts the concrete
claims from a candidate reply and refuses any that are not present in the
grounding set, replacing the reply with an honest fallback and, where warranted,
escalating to a human.
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from app.models.enums import EscalationReason, Language

# Rs 15,000 / ₹15000 / 15,000 rupees / INR 15000
MONEY_PATTERN = re.compile(
    r"(?:(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?))"
    r"|(?:([\d,]+(?:\.\d{1,2})?)\s*(?:rupees|rs\.?|inr))",
    re.IGNORECASE,
)

# "12 units", "12 in stock", "stock is 12", "12 pieces"
QUANTITY_PATTERN = re.compile(
    r"(?:(\d+)\s*(?:units?|pieces?|nos\.?|items?|handsets?))"
    r"|(?:(\d+)\s+(?:in stock|available|left|remaining))"
    r"|(?:(?:stock|quantity|inventory)\s*(?:is|:|=)?\s*(\d+))",
    re.IGNORECASE,
)

# Statements that assert a business policy.
POLICY_PATTERN = re.compile(
    r"\b(?:"
    r"return(?:s|ed)?\s+polic\w+|refund\s+polic\w+|warranty|guarantee|"
    r"exchange\s+polic\w+|delivery\s+charge\w*|shipping\s+charge\w*|"
    r"emi|installment|cancellation\s+polic\w+"
    r")\b",
    re.IGNORECASE,
)

ESCALATION_REQUEST_PATTERN = re.compile(
    r"\b(?:"
    r"speak\s+to\s+(?:a\s+)?(?:human|person|manager|agent|someone)|"
    r"talk\s+to\s+(?:a\s+)?(?:human|person|manager|agent|someone)|"
    r"transfer\s+(?:me\s+)?to|real\s+person|customer\s+care|"
    r"manishi\s+tho|manager\s+tho"
    r")\b",
    re.IGNORECASE,
)

FALLBACK_MESSAGES = {
    Language.ENGLISH: (
        "I don't have that information confirmed right now. "
        "Let me connect you with someone from the team who can help."
    ),
    Language.TANGLISH: (
        "Aa information naa daggara confirm ga ledu. "
        "Team lo evarinaina connect chestanu, vaaru cheptaru."
    ),
    Language.TELUGU: ("ఆ సమాచారం నా దగ్గర ఇప్పుడు నిర్ధారించి లేదు. మా టీమ్ నుండి ఎవరినైనా కలుపుతాను."),
}

UNKNOWN_PRODUCT_MESSAGES = {
    Language.ENGLISH: (
        "I couldn't find that item in our catalogue. "
        "Would you like me to check something else, or connect you to the team?"
    ),
    Language.TANGLISH: (
        "Aa item maa catalogue lo dorakaledu. "
        "Vere edaina check cheyyana, leda team ki connect cheyyana?"
    ),
    Language.TELUGU: ("ఆ వస్తువు మా జాబితాలో దొరకలేదు. వేరే ఏదైనా చూడమంటారా, లేదా టీమ్‌కి కలపమంటారా?"),
}


@dataclass
class GroundingSet:
    """Facts actually retrieved from the Business Brain for this turn.

    Anything outside this set is, by definition, something the AI made up.
    """

    prices: set[Decimal] = field(default_factory=set)
    quantities: set[int] = field(default_factory=set)
    knowledge_passages: list[str] = field(default_factory=list)
    product_names: set[str] = field(default_factory=set)

    @property
    def has_policy_support(self) -> bool:
        return bool(self.knowledge_passages)

    def add_price(self, value: Decimal | int | float | str) -> None:
        self.prices.add(_to_decimal(str(value)))

    def add_quantity(self, value: int) -> None:
        self.quantities.add(int(value))


@dataclass
class Violation:
    kind: str
    detail: str


@dataclass
class GuardrailResult:
    allowed: bool
    response: str
    violations: list[Violation] = field(default_factory=list)
    escalate: bool = False
    escalation_reason: EscalationReason | None = None

    @property
    def blocked(self) -> bool:
        return not self.allowed


def _to_decimal(raw: str) -> Decimal:
    try:
        return Decimal(raw.replace(",", "").strip())
    except (InvalidOperation, AttributeError):
        return Decimal(0)


def extract_money_amounts(text: str) -> set[Decimal]:
    amounts = set()
    for match in MONEY_PATTERN.finditer(text):
        raw = match.group(1) or match.group(2)
        if raw:
            amounts.add(_to_decimal(raw))
    return amounts


def extract_quantities(text: str) -> set[int]:
    quantities = set()
    for match in QUANTITY_PATTERN.finditer(text):
        raw = next((group for group in match.groups() if group), None)
        if raw:
            quantities.add(int(raw))
    return quantities


def mentions_policy(text: str) -> bool:
    return bool(POLICY_PATTERN.search(text))


def customer_requested_human(text: str) -> bool:
    return bool(ESCALATION_REQUEST_PATTERN.search(text))


def check_grounding(response: str, grounding: GroundingSet) -> list[Violation]:
    """Find claims in the response that the grounding set does not support."""
    violations = []

    for amount in extract_money_amounts(response):
        if amount not in grounding.prices:
            violations.append(
                Violation(
                    kind="ungrounded_price",
                    detail=f"Response states {amount} but no such price was retrieved",
                )
            )

    for quantity in extract_quantities(response):
        if quantity not in grounding.quantities:
            violations.append(
                Violation(
                    kind="ungrounded_quantity",
                    detail=f"Response states {quantity} but no such stock figure was retrieved",
                )
            )

    if mentions_policy(response) and not grounding.has_policy_support:
        violations.append(
            Violation(
                kind="ungrounded_policy",
                detail="Response asserts a policy with no supporting knowledge passage",
            )
        )

    return violations


def enforce(
    response: str,
    grounding: GroundingSet,
    language: Language = Language.ENGLISH,
) -> GuardrailResult:
    """Return the response only if every claim in it is grounded.

    A blocked response is replaced with an honest fallback rather than a
    corrected guess, because the system cannot know what the correct value is.
    """
    violations = check_grounding(response, grounding)

    if not violations:
        return GuardrailResult(allowed=True, response=response)

    return GuardrailResult(
        allowed=False,
        response=FALLBACK_MESSAGES.get(language, FALLBACK_MESSAGES[Language.ENGLISH]),
        violations=violations,
        escalate=True,
        escalation_reason=EscalationReason.UNGROUNDED_ANSWER,
    )


def unknown_product_response(language: Language = Language.ENGLISH) -> str:
    return UNKNOWN_PRODUCT_MESSAGES.get(language, UNKNOWN_PRODUCT_MESSAGES[Language.ENGLISH])


def fallback_response(language: Language = Language.ENGLISH) -> str:
    return FALLBACK_MESSAGES.get(language, FALLBACK_MESSAGES[Language.ENGLISH])
