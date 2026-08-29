"""Source selection.

Includes the five routing tests the implementation plan requires for Phase 6.
"""

import pytest

from app.models.enums import Intent, RouteSource, ToolName
from app.services.router import route

# --- The five required tests from the implementation plan -------------------


def test_iphone_price_routes_to_product_database():
    decision = route("What is the iPhone 15 price?")

    assert decision.intent is Intent.PRODUCT_PRICE
    assert decision.source is RouteSource.STRUCTURED_DATA
    assert ToolName.FIND_PRODUCT in decision.tools


def test_return_policy_routes_to_knowledge_base():
    decision = route("What is your return policy?")

    assert decision.intent is Intent.POLICY_QUESTION
    assert decision.source is RouteSource.KNOWLEDGE_BASE
    assert ToolName.SEARCH_KNOWLEDGE in decision.tools


def test_pixel_availability_routes_to_inventory():
    decision = route("Is the Pixel 9 available?")

    assert decision.intent is Intent.INVENTORY
    assert decision.source is RouteSource.INVENTORY
    assert ToolName.CHECK_INVENTORY in decision.tools


def test_tomorrow_eleven_am_routes_to_calendar():
    decision = route("Can I book an appointment tomorrow at 11 AM?")

    assert decision.intent is Intent.APPOINTMENT
    assert decision.source is RouteSource.CALENDAR
    assert ToolName.CHECK_AVAILABILITY in decision.tools
    assert ToolName.BOOK_APPOINTMENT in decision.tools


def test_send_details_on_whatsapp_routes_to_whatsapp_tool():
    decision = route("Send me the details on WhatsApp")

    assert decision.source is RouteSource.WHATSAPP
    assert ToolName.SEND_BROCHURE in decision.tools


# --- Tanglish equivalents ---------------------------------------------------


def test_tanglish_price_question_routes_to_structured_data():
    decision = route("iPhone 15 price entha?")

    assert decision.source is RouteSource.STRUCTURED_DATA


def test_tanglish_stock_question_routes_to_inventory():
    decision = route("Pixel 9 stock lo undha?")

    assert decision.source is RouteSource.INVENTORY


def test_tanglish_whatsapp_request_routes_to_whatsapp():
    decision = route("WhatsApp lo details pampinchandi")

    assert decision.source is RouteSource.WHATSAPP


# --- Ordering and precedence ------------------------------------------------


def test_human_request_overrides_every_other_intent():
    """Even mid-question, asking for a person wins."""
    decision = route("What is the iPhone 15 price? Actually let me speak to a manager")

    assert decision.intent is Intent.HUMAN_TRANSFER
    assert decision.source is RouteSource.HUMAN


def test_availability_wins_over_price_when_both_are_present():
    decision = route("Is the Pixel 9 available and what is the price?")

    assert decision.source is RouteSource.INVENTORY


def test_price_question_is_not_pulled_into_the_knowledge_base():
    """'price' must not be captured by the policy vocabulary."""
    decision = route("What is the iPhone 15 price?")

    assert decision.source is not RouteSource.KNOWLEDGE_BASE


def test_delivery_question_routes_to_knowledge_not_inventory():
    decision = route("Do you offer free delivery?")

    assert decision.source is RouteSource.KNOWLEDGE_BASE


def test_whatsapp_location_request_routes_to_location_tool():
    decision = route("Send your address on WhatsApp")

    assert decision.intent is Intent.SEND_LOCATION
    assert ToolName.SEND_LOCATION in decision.tools


def test_location_without_whatsapp_routes_to_knowledge():
    decision = route("Where is your store located?")

    assert decision.source is RouteSource.KNOWLEDGE_BASE


def test_comparison_routes_to_structured_data():
    decision = route("Which is better, the iPhone 15 or the Pixel 9?")

    assert decision.intent is Intent.COMPARISON
    assert decision.source is RouteSource.STRUCTURED_DATA


def test_caller_details_route_to_crm():
    decision = route("My name is Ravi and my number is 9876543210")

    assert decision.intent is Intent.PROVIDE_DETAILS
    assert decision.source is RouteSource.CRM


def test_greeting_needs_no_source():
    decision = route("Hello")

    assert decision.intent is Intent.GREETING
    assert decision.source is RouteSource.NONE


@pytest.mark.parametrize(
    "text",
    [
        "What is the weather like today?",
        "Tell me a joke",
    ],
)
def test_unroutable_question_returns_no_source(text):
    """An unknown question must not be forced into a source."""
    decision = route(text)

    assert decision.intent is Intent.UNKNOWN
    assert decision.source is RouteSource.NONE
    assert decision.tools == []
    assert decision.confidence < 0.5


def test_empty_utterance_is_unknown():
    decision = route("   ")

    assert decision.intent is Intent.UNKNOWN
    assert decision.confidence == 0.0


def test_product_mention_alone_routes_to_structured_data():
    decision = route("iPhone 15", has_product_mention=True)

    assert decision.source is RouteSource.STRUCTURED_DATA


def test_every_decision_explains_itself():
    """Routing reasons are surfaced to trainers, so they must never be blank."""
    for text in [
        "What is the iPhone 15 price?",
        "Is the Pixel 9 in stock?",
        "What is your return policy?",
        "Book me a slot tomorrow at 11 AM",
        "Send it on WhatsApp",
    ]:
        assert route(text).reason
