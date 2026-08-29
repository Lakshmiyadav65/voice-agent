"""The PRD's example conversation, run end to end.

    Customer: "iPhone 15 price entha?"
    Customer: "What about Pixel 9?"
    Customer: "Pixel 9 stock lo undha?"
    Customer: "WhatsApp lo details pampinchandi."

The WhatsApp action itself arrives in Phase 8; here the turn must be understood
and answered without inventing anything.
"""

import pytest

from app.models.enums import ConversationState, Language, TurnRole
from tests.conftest import auth_headers
from tests.factories import build_mobile_store

POLICY_TEXT = """Return Policy

Handsets may be returned within 7 days of purchase with the original receipt.

Warranty

All handsets carry a 12 month manufacturer warranty covering hardware defects.
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


async def _start(client, store):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations",
        json={"language": Language.TANGLISH},
        headers=auth_headers(store["owner_token"]),
    )
    return response.json()


async def _say(client, store, conversation_id, message):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations/{conversation_id}/turns",
        json={"message": message},
        headers=auth_headers(store["owner_token"]),
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_prd_example_conversation(client, store):
    conversation = await _start(client, store)
    conversation_id = conversation["id"]

    # "iPhone 15 price entha?" -> structured price lookup
    iphone = await _say(client, store, conversation_id, "iPhone 15 price entha?")
    assert iphone["language"] == Language.TANGLISH
    assert iphone["product_found"] is True
    assert "15000" in iphone["grounding"]["prices"]
    assert iphone["blocked"] is False

    # "What about Pixel 9?" -> a fresh lookup, not a carried-over answer
    pixel = await _say(client, store, conversation_id, "What about Pixel 9 price?")
    assert pixel["product_found"] is True
    assert "20000" in pixel["grounding"]["prices"]
    assert "15000" not in pixel["grounding"]["prices"]

    # "Pixel 9 stock lo undha?" -> inventory check, answered in Tanglish
    stock = await _say(client, store, conversation_id, "Pixel 9 stock lo undha?")
    assert stock["language"] == Language.TANGLISH
    assert 5 in stock["grounding"]["quantities"]

    # "WhatsApp lo details pampinchandi." -> understood, nothing fabricated
    whatsapp = await _say(client, store, conversation_id, "WhatsApp lo details pampinchandi")
    assert whatsapp["language"] == Language.TANGLISH
    assert whatsapp["blocked"] is False

    state = await client.get(
        f"/api/v1/businesses/{store['business_id']}/conversations/{conversation_id}",
        headers=auth_headers(store["owner_token"]),
    )
    body = state.json()

    assert body["state"] != ConversationState.ESCALATED
    assert sum(1 for t in body["turns"] if t["role"] == TurnRole.CUSTOMER) == 4
    assert body["slots"]["product_interest"] in {"iPhone 15", "Pixel 9"}


@pytest.mark.asyncio
async def test_mixed_language_conversation_keeps_context(client, store):
    """A caller switching between English and Tanglish is followed, not reset."""
    conversation = await _start(client, store)
    conversation_id = conversation["id"]

    first = await _say(client, store, conversation_id, "What is the iPhone 15 price?")
    second = await _say(client, store, conversation_id, "Stock lo undha?")
    third = await _say(client, store, conversation_id, "What is the return policy?")

    assert first["language"] == Language.ENGLISH
    assert second["language"] == Language.TANGLISH
    assert third["language"] == Language.ENGLISH
    assert third["knowledge_sources"]


@pytest.mark.asyncio
async def test_no_turn_in_the_scenario_fabricates_a_figure(client, store):
    """Sweep the whole conversation for ungrounded claims."""
    conversation = await _start(client, store)
    conversation_id = conversation["id"]

    questions = [
        "iPhone 15 price entha?",
        "Pixel 9 price entha?",
        "Pixel 9 stock lo undha?",
        "What is the return policy?",
        "Do you deliver to my area?",
    ]

    for question in questions:
        result = await _say(client, store, conversation_id, question)
        assert result["violations"] == [], f"{question} produced {result['violations']}"
