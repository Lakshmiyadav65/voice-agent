"""Intent routing and source selection.

Implements the TRD's source-selection table:

    product / price   -> structured database
    FAQ / policy      -> knowledge base
    availability      -> inventory
    appointment       -> calendar
    WhatsApp request  -> WhatsApp tool
    unknown           -> safe response or human

Routing is rule-based and deterministic rather than model-driven. The choice of
*where a fact comes from* is a correctness property, so it is decided by code
that can be read and tested, not inferred by a model each call.
"""

import re
from dataclasses import dataclass, field

from app.models.enums import Intent, RouteSource, ToolName

# Ordered: the first matching rule wins, so specific intents are listed before
# general ones. Patterns cover English and romanized Telugu.
PRICE_PATTERN = re.compile(
    r"\b(?:price|prices|cost|costs|rate|rates|how much|entha|enta|ela unndi|"
    r"vela|dhara)\b",
    re.IGNORECASE,
)

INVENTORY_PATTERN = re.compile(
    r"\b(?:stock|in stock|available|availability|inventory|do you have|"
    r"undha|unda|unnaya|unnayi|dorukutunda)\b",
    re.IGNORECASE,
)

APPOINTMENT_PATTERN = re.compile(
    r"\b(?:appointment|book|booking|schedule|slot|visit|come over|meet|"
    r"reserve|appointment kavali|book cheyandi|time kavali)\b",
    re.IGNORECASE,
)

WHATSAPP_PATTERN = re.compile(
    r"\b(?:whatsapp|whats app|wa)\b",
    re.IGNORECASE,
)

BROCHURE_PATTERN = re.compile(
    r"\b(?:brochure|catalogue|catalog|details|specifications|specs|pdf)\b",
    re.IGNORECASE,
)

LOCATION_PATTERN = re.compile(
    r"\b(?:location|located|address|directions|map|ekkada|elaa raavali)\b"
    r"|where\s+(?:is|are)\s+(?:your|the|you)\b",
    re.IGNORECASE,
)

POLICY_PATTERN = re.compile(
    r"\b(?:policy|policies|return|returns|refund|warranty|guarantee|exchange|"
    r"emi|installment|delivery|shipping|timings|open|closed|hours|"
    r"payment|cancellation)\b",
    re.IGNORECASE,
)

HUMAN_PATTERN = re.compile(
    r"\b(?:human|person|manager|agent|representative|customer care|"
    r"speak to someone|talk to someone|transfer)\b",
    re.IGNORECASE,
)

COMPARISON_PATTERN = re.compile(
    r"\b(?:compare|comparison|difference|better|vs|versus|which one|"
    r"cheaper|costlier|edi better)\b",
    re.IGNORECASE,
)

GREETING_PATTERN = re.compile(
    r"^\s*(?:hi|hello|hey|good morning|good afternoon|good evening|"
    r"namaskaram|namaste)\b",
    re.IGNORECASE,
)

# Deliberately excludes bare openers like "what is", which introduce any
# question at all and would swallow utterances the router should decline.
PRODUCT_INFO_PATTERN = re.compile(
    r"\b(?:tell me about|features|colour|color|camera|battery|storage|"
    r"models|variants|gurinchi)\b",
    re.IGNORECASE,
)

# A caller supplying their own details rather than asking a question.
DETAILS_PATTERN = re.compile(
    r"\b(?:my name is|my number is|my budget|i am|call me|naa peru|naa number)\b",
    re.IGNORECASE,
)


@dataclass
class RoutingDecision:
    intent: Intent
    source: RouteSource
    tools: list[ToolName] = field(default_factory=list)
    reason: str = ""
    confidence: float = 0.0

    @property
    def needs_structured_data(self) -> bool:
        return self.source in (RouteSource.STRUCTURED_DATA, RouteSource.INVENTORY)


def _decision(
    intent: Intent,
    source: RouteSource,
    tools: list[ToolName],
    reason: str,
    confidence: float = 0.9,
) -> RoutingDecision:
    return RoutingDecision(
        intent=intent, source=source, tools=tools, reason=reason, confidence=confidence
    )


def route(text: str, has_product_mention: bool = False) -> RoutingDecision:
    """Choose the source and tools for one customer utterance.

    `has_product_mention` is supplied by the caller after matching the utterance
    against the live catalogue, so routing stays independent of any hardcoded
    product vocabulary.
    """
    stripped = text.strip()
    if not stripped:
        return _decision(Intent.UNKNOWN, RouteSource.NONE, [], "Empty utterance", confidence=0.0)

    # An explicit request for a person overrides everything else.
    if HUMAN_PATTERN.search(stripped):
        return _decision(
            Intent.HUMAN_TRANSFER,
            RouteSource.HUMAN,
            [ToolName.TRANSFER_TO_HUMAN],
            "Caller asked for a human",
            confidence=0.95,
        )

    wants_whatsapp = bool(WHATSAPP_PATTERN.search(stripped))

    if wants_whatsapp and LOCATION_PATTERN.search(stripped):
        return _decision(
            Intent.SEND_LOCATION,
            RouteSource.WHATSAPP,
            [ToolName.SEND_LOCATION],
            "Location requested over WhatsApp",
        )

    if wants_whatsapp and BROCHURE_PATTERN.search(stripped):
        return _decision(
            Intent.SEND_BROCHURE,
            RouteSource.WHATSAPP,
            [ToolName.FIND_PRODUCT, ToolName.SEND_BROCHURE],
            "Product details requested over WhatsApp",
        )

    if wants_whatsapp:
        return _decision(
            Intent.SEND_WHATSAPP,
            RouteSource.WHATSAPP,
            [ToolName.SEND_WHATSAPP],
            "Caller asked for information on WhatsApp",
        )

    if APPOINTMENT_PATTERN.search(stripped):
        return _decision(
            Intent.APPOINTMENT,
            RouteSource.CALENDAR,
            [ToolName.CHECK_AVAILABILITY, ToolName.BOOK_APPOINTMENT],
            "Appointment requested",
        )

    if COMPARISON_PATTERN.search(stripped):
        return _decision(
            Intent.COMPARISON,
            RouteSource.STRUCTURED_DATA,
            [ToolName.FIND_PRODUCT],
            "Comparison needs current figures for each product",
        )

    # Inventory before price: "is the Pixel available" is a stock question even
    # though a price question often accompanies it.
    if INVENTORY_PATTERN.search(stripped):
        return _decision(
            Intent.INVENTORY,
            RouteSource.INVENTORY,
            [ToolName.CHECK_INVENTORY],
            "Availability must come from live inventory",
        )

    if PRICE_PATTERN.search(stripped):
        return _decision(
            Intent.PRODUCT_PRICE,
            RouteSource.STRUCTURED_DATA,
            [ToolName.FIND_PRODUCT],
            "Price must come from structured data",
        )

    # Policy questions are checked after product intents so that "delivery
    # charge for the iPhone 15" still resolves as policy, but "iPhone 15 price"
    # does not get pulled into the knowledge base.
    if POLICY_PATTERN.search(stripped):
        return _decision(
            Intent.POLICY_QUESTION,
            RouteSource.KNOWLEDGE_BASE,
            [ToolName.SEARCH_KNOWLEDGE],
            "Policy and FAQ answers come from the knowledge base",
        )

    if LOCATION_PATTERN.search(stripped):
        return _decision(
            Intent.POLICY_QUESTION,
            RouteSource.KNOWLEDGE_BASE,
            [ToolName.SEARCH_KNOWLEDGE],
            "Store details come from the knowledge base",
        )

    if has_product_mention or PRODUCT_INFO_PATTERN.search(stripped):
        return _decision(
            Intent.PRODUCT_INFO,
            RouteSource.STRUCTURED_DATA,
            [ToolName.FIND_PRODUCT],
            "Product details come from structured data",
            confidence=0.8,
        )

    if DETAILS_PATTERN.search(stripped):
        return _decision(
            Intent.PROVIDE_DETAILS,
            RouteSource.CRM,
            [ToolName.CREATE_LEAD],
            "Caller supplied their own details",
            confidence=0.7,
        )

    if GREETING_PATTERN.search(stripped):
        return _decision(Intent.GREETING, RouteSource.NONE, [], "Opening greeting", confidence=0.9)

    return _decision(
        Intent.UNKNOWN,
        RouteSource.NONE,
        [],
        "No confident source for this question",
        confidence=0.2,
    )
