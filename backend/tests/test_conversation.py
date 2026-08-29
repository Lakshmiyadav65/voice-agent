"""Conversation engine behaviour: state, memory, language, and guardrails in the loop."""

import pytest

from app.models.enums import ConversationState, EscalationReason, Language, TurnRole
from app.providers.offline import ContextOnlyLLMProvider, FailingLLMProvider
from tests.conftest import auth_headers
from tests.factories import build_mobile_store

POLICY_TEXT = """Return Policy

Handsets may be returned within 7 days of purchase with the original receipt.

Delivery

Home delivery is free for orders above Rs 10,000 within city limits.
"""


@pytest.fixture
async def store(client, db):
    built = await build_mobile_store(client, db)
    await client.post(
        f"/api/v1/businesses/{built['business_id']}/knowledge/documents/text",
        json={"name": "Store Policies", "content": POLICY_TEXT},
        headers=auth_headers(built["owner_token"]),
    )
    return built


async def _start(client, store, language=Language.ENGLISH):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations",
        json={"language": language},
        headers=auth_headers(store["owner_token"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _say(client, store, conversation_id, message):
    return await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations/{conversation_id}/turns",
        json={"message": message},
        headers=auth_headers(store["owner_token"]),
    )


@pytest.mark.asyncio
async def test_conversation_opens_with_a_greeting(client, store):
    conversation = await _start(client, store)

    assert conversation["state"] == ConversationState.UNDERSTANDING
    assert conversation["turns"][0]["role"] == TurnRole.AI
    assert "Sri Mobile Store" in conversation["turns"][0]["text"]


@pytest.mark.asyncio
async def test_greeting_is_localised_to_tanglish(client, store):
    conversation = await _start(client, store, Language.TANGLISH)

    assert "Namaskaram" in conversation["turns"][0]["text"]


@pytest.mark.asyncio
async def test_price_question_is_answered_from_structured_data(client, store):
    conversation = await _start(client, store)

    response = await _say(client, store, conversation["id"], "What is the iPhone 15 price?")

    body = response.json()
    assert body["product_found"] is True
    assert "15000" in body["grounding"]["prices"]
    assert body["blocked"] is False


@pytest.mark.asyncio
async def test_grounding_is_reported_for_review(client, store):
    """The trainer must be able to see what a reply was allowed to assert."""
    conversation = await _start(client, store)

    response = await _say(client, store, conversation["id"], "Pixel 9 price and stock?")
    grounding = response.json()["grounding"]

    assert "20000" in grounding["prices"]
    assert 5 in grounding["quantities"]
    assert "Pixel 9" in grounding["product_names"]


@pytest.mark.asyncio
async def test_unknown_product_is_refused_not_invented(client, store):
    conversation = await _start(client, store)

    response = await _say(client, store, conversation["id"], "What is the OnePlus 13 price?")
    body = response.json()

    assert body["product_found"] is False
    assert body["grounding"]["product_names"] == []
    assert "couldn't find that item" in body["reply"]
    # No catalogue price may appear for a product we do not carry.
    assert "15000" not in body["grounding"]["prices"]
    assert "20000" not in body["grounding"]["prices"]


@pytest.mark.asyncio
async def test_partial_product_name_does_not_resolve(client, store):
    """Phase 3's exact-match rule still holds inside a conversation."""
    conversation = await _start(client, store)

    response = await _say(client, store, conversation["id"], "What is the iPhone price?")
    body = response.json()

    assert body["product_found"] is False
    assert "15000" not in body["grounding"]["prices"]


@pytest.mark.asyncio
async def test_tanglish_question_gets_a_tanglish_reply(client, store):
    conversation = await _start(client, store)

    response = await _say(client, store, conversation["id"], "iPhone 15 price entha?")
    body = response.json()

    assert body["language"] == Language.TANGLISH
    assert body["product_found"] is True


@pytest.mark.asyncio
async def test_language_switches_mid_conversation(client, store):
    conversation = await _start(client, store)

    english = await _say(client, store, conversation["id"], "What is the iPhone 15 price?")
    tanglish = await _say(client, store, conversation["id"], "Pixel 9 stock lo undha?")

    assert english.json()["language"] == Language.ENGLISH
    assert tanglish.json()["language"] == Language.TANGLISH


@pytest.mark.asyncio
async def test_context_is_remembered_across_turns(client, store):
    """The caller should not have to repeat what they already said."""
    conversation = await _start(client, store)
    conversation_id = conversation["id"]

    await _say(client, store, conversation_id, "I am looking at the iPhone 15, price entha?")
    await _say(client, store, conversation_id, "My budget is 20000")

    state = await client.get(
        f"/api/v1/businesses/{store['business_id']}/conversations/{conversation_id}",
        headers=auth_headers(store["owner_token"]),
    )
    slots = state.json()["slots"]

    assert slots["product_interest"] == "iPhone 15"
    assert slots["budget"] == "20000"


@pytest.mark.asyncio
async def test_transcript_accumulates_every_turn(client, store):
    conversation = await _start(client, store)
    conversation_id = conversation["id"]

    await _say(client, store, conversation_id, "What is the iPhone 15 price?")
    await _say(client, store, conversation_id, "And the Pixel 9?")

    state = await client.get(
        f"/api/v1/businesses/{store['business_id']}/conversations/{conversation_id}",
        headers=auth_headers(store["owner_token"]),
    )
    roles = [turn["role"] for turn in state.json()["turns"]]

    assert roles.count(TurnRole.CUSTOMER) == 2
    assert roles.count(TurnRole.AI) == 3  # greeting plus two replies


@pytest.mark.asyncio
async def test_knowledge_question_returns_sources(client, store):
    conversation = await _start(client, store)

    response = await _say(client, store, conversation["id"], "What is your return policy?")
    body = response.json()

    assert body["knowledge_sources"]
    assert body["knowledge_sources"][0]["document_name"] == "Store Policies.txt"


@pytest.mark.asyncio
async def test_request_for_a_human_escalates_immediately(client, store):
    conversation = await _start(client, store)

    response = await _say(client, store, conversation["id"], "I want to speak to a human")
    body = response.json()

    assert body["escalated"] is True
    assert body["escalation_reason"] == EscalationReason.CUSTOMER_REQUEST
    assert body["state"] == ConversationState.ESCALATED


@pytest.mark.asyncio
async def test_ended_conversation_rejects_further_turns(client, store):
    conversation = await _start(client, store)
    conversation_id = conversation["id"]

    await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations/{conversation_id}/end",
        headers=auth_headers(store["owner_token"]),
    )
    response = await _say(client, store, conversation_id, "One more question")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_interruption_is_recorded_on_the_ai_turn(client, store):
    """Barge-in must be visible so the AI does not repeat itself."""
    conversation = await _start(client, store)
    conversation_id = conversation["id"]

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations/{conversation_id}/interrupt",
        headers=auth_headers(store["owner_token"]),
    )
    ai_turns = [t for t in response.json()["turns"] if t["role"] == TurnRole.AI]

    assert ai_turns[-1]["interrupted"] is True


@pytest.mark.asyncio
async def test_conversations_are_isolated_between_businesses(client, db, store):
    other = await build_mobile_store(
        client, db, owner_email="priya@othermobile.in", business_name="Other Mobile"
    )
    conversation = await _start(client, store)

    response = await client.get(
        f"/api/v1/businesses/{other['business_id']}/conversations/{conversation['id']}",
        headers=auth_headers(other["owner_token"]),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_language_detection_endpoint(client, store):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations/detect-language",
        json={"text": "Pixel 9 stock lo undha?"},
        headers=auth_headers(store["owner_token"]),
    )
    body = response.json()

    assert body["language"] == Language.TANGLISH
    assert body["reply_language"] == Language.TANGLISH
    assert "undha" in body["markers"]


@pytest.mark.asyncio
async def test_hallucinated_price_from_the_model_is_blocked(client, db, store, monkeypatch):
    """If the model invents a figure, the guardrail stops it reaching the caller."""
    from app.core.providers import get_llm_provider
    from app.main import app

    liar = ContextOnlyLLMProvider(scripted_replies=["The iPhone 15 is Rs 9,999 only."])
    app.dependency_overrides[get_llm_provider] = lambda: liar

    conversation = await _start(client, store)
    response = await _say(client, store, conversation["id"], "What is the iPhone 15 price?")
    body = response.json()

    assert body["blocked"] is True
    assert "9,999" not in body["reply"]
    assert body["escalation_reason"] == EscalationReason.UNGROUNDED_ANSWER
    assert body["violations"][0]["kind"] == "ungrounded_price"


@pytest.mark.asyncio
async def test_provider_failure_is_reported_honestly(client, store):
    """A model outage must never be dressed up as a normal answer."""
    from app.core.providers import get_llm_provider
    from app.main import app

    app.dependency_overrides[get_llm_provider] = lambda: FailingLLMProvider()

    conversation = await _start(client, store)
    response = await _say(client, store, conversation["id"], "What is your return policy?")
    body = response.json()

    assert body["escalated"] is True
    assert body["escalation_reason"] == EscalationReason.PROVIDER_FAILURE
    assert "trouble on my side" in body["reply"]


@pytest.mark.asyncio
async def test_repeated_unknown_questions_escalate(client, store):
    """Three dead ends hand the call to a human instead of looping."""
    conversation = await _start(client, store)
    conversation_id = conversation["id"]

    for model in ["OnePlus 13", "Nothing Phone 3", "Realme GT 7"]:
        response = await _say(client, store, conversation_id, f"What is the {model} price?")

    body = response.json()
    assert body["escalated"] is True
    assert body["escalation_reason"] == EscalationReason.REPEATED_FAILURE
