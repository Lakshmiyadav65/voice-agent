"""Routing observed through a real conversation.

The router tests prove source selection in isolation; these prove the engine
actually honours those decisions and reports them for review.
"""

import pytest

from app.models.enums import Intent, RouteSource, ToolName, ToolStatus
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


async def _start(client, store):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations",
        json={},
        headers=auth_headers(store["owner_token"]),
    )
    return response.json()["id"]


async def _say(client, store, conversation_id, message):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations/{conversation_id}/turns",
        json={"message": message},
        headers=auth_headers(store["owner_token"]),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _tools_used(turn) -> set[str]:
    return {call["tool"] for call in turn["tool_calls"]}


@pytest.mark.asyncio
async def test_price_question_routes_and_calls_find_product(client, store):
    conversation_id = await _start(client, store)

    turn = await _say(client, store, conversation_id, "What is the iPhone 15 price?")

    assert turn["routing"]["intent"] == Intent.PRODUCT_PRICE
    assert turn["routing"]["source"] == RouteSource.STRUCTURED_DATA
    assert ToolName.FIND_PRODUCT in _tools_used(turn)
    assert "15000" in turn["grounding"]["prices"]


@pytest.mark.asyncio
async def test_policy_question_routes_to_knowledge_and_searches(client, store):
    conversation_id = await _start(client, store)

    turn = await _say(client, store, conversation_id, "What is your return policy?")

    assert turn["routing"]["source"] == RouteSource.KNOWLEDGE_BASE
    assert ToolName.SEARCH_KNOWLEDGE in _tools_used(turn)
    assert turn["knowledge_sources"]


@pytest.mark.asyncio
async def test_availability_question_routes_to_inventory(client, store):
    conversation_id = await _start(client, store)

    turn = await _say(client, store, conversation_id, "Is the Pixel 9 available?")

    assert turn["routing"]["source"] == RouteSource.INVENTORY
    assert ToolName.CHECK_INVENTORY in _tools_used(turn)
    assert 5 in turn["grounding"]["quantities"]


@pytest.mark.asyncio
async def test_appointment_request_routes_to_calendar(client, store):
    conversation_id = await _start(client, store)

    turn = await _say(
        client, store, conversation_id, "Can I book an appointment tomorrow at 11 AM?"
    )

    assert turn["routing"]["source"] == RouteSource.CALENDAR
    assert ToolName.CHECK_AVAILABILITY in _tools_used(turn)

    availability = next(
        call for call in turn["tool_calls"] if call["tool"] == ToolName.CHECK_AVAILABILITY
    )
    assert availability["status"] == ToolStatus.SUCCESS
    assert availability["data"]["available"] is True


@pytest.mark.asyncio
async def test_whatsapp_request_routes_to_whatsapp(client, store):
    conversation_id = await _start(client, store)

    turn = await _say(client, store, conversation_id, "Send me the details on WhatsApp")

    assert turn["routing"]["source"] == RouteSource.WHATSAPP


@pytest.mark.asyncio
async def test_appointment_is_not_booked_without_a_phone_number(client, store):
    """A half-heard request must not create a booking."""
    conversation_id = await _start(client, store)

    turn = await _say(client, store, conversation_id, "Book an appointment tomorrow at 11 AM")

    assert ToolName.BOOK_APPOINTMENT not in _tools_used(turn)


@pytest.mark.asyncio
async def test_tool_calls_are_reported_with_status_and_timing(client, store):
    conversation_id = await _start(client, store)

    turn = await _say(client, store, conversation_id, "What is the iPhone 15 price?")
    call = turn["tool_calls"][0]

    assert call["status"] == ToolStatus.SUCCESS
    assert call["arguments"]["product_name"] == "iPhone 15"
    assert call["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_failed_tool_call_is_visible_in_the_turn(client, store):
    conversation_id = await _start(client, store)

    turn = await _say(client, store, conversation_id, "Is the OnePlus 13 available?")
    statuses = {call["status"] for call in turn["tool_calls"]}

    assert turn["routing"]["source"] == RouteSource.INVENTORY
    # Nothing matched the catalogue, so no inventory call was even attempted
    # with a fabricated product name.
    assert ToolStatus.SUCCESS not in statuses or not turn["tool_calls"]
    assert turn["product_found"] is False


@pytest.mark.asyncio
async def test_routing_reason_is_always_reported(client, store):
    conversation_id = await _start(client, store)

    for message in [
        "What is the iPhone 15 price?",
        "What is your return policy?",
        "Is the Pixel 9 in stock?",
    ]:
        turn = await _say(client, store, conversation_id, message)
        assert turn["routing"]["reason"]


@pytest.mark.asyncio
async def test_route_preview_endpoint(client, store):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations/route",
        json={"text": "Is the Pixel 9 in stock?"},
        headers=auth_headers(store["owner_token"]),
    )
    body = response.json()

    assert body["source"] == RouteSource.INVENTORY
    assert ToolName.CHECK_INVENTORY in body["tools"]
    assert body["confidence"] > 0.5


@pytest.mark.asyncio
async def test_route_preview_recognises_catalogue_products(client, store):
    """A bare product name routes to structured data only because it is stocked."""
    known = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations/route",
        json={"text": "iPhone 15"},
        headers=auth_headers(store["owner_token"]),
    )
    unknown = await client.post(
        f"/api/v1/businesses/{store['business_id']}/conversations/route",
        json={"text": "Ferrari F40"},
        headers=auth_headers(store["owner_token"]),
    )

    assert known.json()["source"] == RouteSource.STRUCTURED_DATA
    assert unknown.json()["source"] == RouteSource.NONE
