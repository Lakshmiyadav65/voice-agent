"""Guardrail behaviour: no business fact reaches a caller unless it was retrieved."""

from decimal import Decimal

from app.models.enums import EscalationReason, Language
from app.services.guardrails import (
    GroundingSet,
    check_grounding,
    customer_requested_human,
    enforce,
    extract_money_amounts,
    extract_quantities,
    mentions_policy,
)


def _grounded_price(amount: str) -> GroundingSet:
    grounding = GroundingSet()
    grounding.add_price(Decimal(amount))
    return grounding


def test_money_is_extracted_in_common_formats():
    assert extract_money_amounts("It costs Rs 15,000") == {Decimal("15000")}
    assert extract_money_amounts("The price is ₹15000") == {Decimal("15000")}
    assert extract_money_amounts("about 15,000 rupees") == {Decimal("15000")}
    assert extract_money_amounts("INR 20000 only") == {Decimal("20000")}


def test_quantities_are_extracted():
    assert 12 in extract_quantities("We have 12 units available")
    assert 5 in extract_quantities("5 in stock")
    assert 8 in extract_quantities("Stock is 8")


def test_grounded_price_is_allowed():
    result = enforce("The iPhone 15 is Rs 15,000.", _grounded_price("15000"))

    assert result.allowed
    assert "15,000" in result.response


def test_ungrounded_price_is_blocked():
    """The central guarantee: a price nobody retrieved cannot be spoken."""
    result = enforce("The iPhone 15 is Rs 14,000.", _grounded_price("15000"))

    assert result.blocked
    assert result.escalation_reason is EscalationReason.UNGROUNDED_ANSWER
    assert "14,000" not in result.response
    assert result.violations[0].kind == "ungrounded_price"


def test_blocked_response_does_not_guess_a_correction():
    """A blocked reply admits ignorance rather than substituting the real value."""
    result = enforce("It is Rs 14,000.", _grounded_price("15000"))

    assert "15,000" not in result.response
    assert "15000" not in result.response
    assert "don't have that information" in result.response


def test_price_invented_with_no_grounding_at_all_is_blocked():
    result = enforce("That model is Rs 25,000.", GroundingSet())

    assert result.blocked


def test_ungrounded_quantity_is_blocked():
    grounding = GroundingSet()
    grounding.add_quantity(5)

    result = enforce("We have 20 units in stock.", grounding)

    assert result.blocked
    assert result.violations[0].kind == "ungrounded_quantity"


def test_grounded_quantity_is_allowed():
    grounding = GroundingSet()
    grounding.add_quantity(12)

    assert enforce("We have 12 units available.", grounding).allowed


def test_policy_claim_without_a_passage_is_blocked():
    result = enforce("Our return policy allows returns anytime.", GroundingSet())

    assert result.blocked
    assert result.violations[0].kind == "ungrounded_policy"


def test_policy_claim_with_a_passage_is_allowed():
    grounding = GroundingSet(knowledge_passages=["Returns accepted within 7 days."])

    assert enforce("Our return policy allows 7 days.", grounding).allowed


def test_figures_quoted_from_a_passage_count_as_grounded():
    grounding = GroundingSet(knowledge_passages=["Free delivery above Rs 10,000."])
    grounding.add_price(Decimal("10000"))

    assert enforce("Delivery is free above Rs 10,000.", grounding).allowed


def test_reply_with_no_claims_is_always_allowed():
    result = enforce("Sure, let me check that for you.", GroundingSet())

    assert result.allowed


def test_multiple_violations_are_all_reported():
    violations = check_grounding("It is Rs 9,000 and we have 3 units.", GroundingSet())

    kinds = {v.kind for v in violations}
    assert "ungrounded_price" in kinds
    assert "ungrounded_quantity" in kinds


def test_fallback_is_localised():
    tanglish = enforce("It is Rs 1.", GroundingSet(), Language.TANGLISH)
    telugu = enforce("It is Rs 1.", GroundingSet(), Language.TELUGU)

    assert "chestanu" in tanglish.response
    assert "సమాచారం" in telugu.response


def test_policy_keywords_are_recognised():
    assert mentions_policy("what is the warranty")
    assert mentions_policy("Our refund policy is simple")
    assert not mentions_policy("The phone is blue")


def test_requests_for_a_human_are_recognised():
    assert customer_requested_human("I want to speak to a human")
    assert customer_requested_human("transfer me to the manager")
    assert customer_requested_human("can I talk to someone")
    assert not customer_requested_human("what is the price")
