"""Telephony webhooks and the end-to-end call flow."""

import pytest

from app.models.enums import CallOutcome, CallStatus, RecordingConsent
from app.providers.telephony import MockTelephonyProvider
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


def _incoming_payload(call_sid="CA-test-1", from_number="+919876543210"):
    return {
        "CallSid": call_sid,
        "From": from_number,
        "To": "+919000000001",
        "CallStatus": "ringing",
        "Direction": "inbound",
    }


async def _incoming(client, store, payload=None):
    return await client.post(
        f"/api/v1/telephony/{store['business_id']}/incoming",
        json=payload or _incoming_payload(),
    )


async def _status(client, store, payload):
    return await client.post(f"/api/v1/telephony/{store['business_id']}/status", json=payload)


async def _say(client, store, call_id, text):
    return await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/{call_id}/utterances",
        json={"text": text},
        headers=auth_headers(store["owner_token"]),
    )


async def _get_call(client, store, call_id):
    response = await client.get(
        f"/api/v1/businesses/{store['business_id']}/calls/{call_id}",
        headers=auth_headers(store["owner_token"]),
    )
    return response.json()


@pytest.mark.asyncio
async def test_incoming_webhook_starts_a_call(client, store):
    response = await _incoming(client, store)
    body = response.json()

    assert response.status_code == 200
    assert body["received"] is True
    assert body["action"] == "answered"
    assert body["call_id"]


@pytest.mark.asyncio
async def test_incoming_webhook_records_the_caller_number(client, store):
    response = await _incoming(client, store)
    call = await _get_call(client, store, response.json()["call_id"])

    assert call["phone_number"] == "919876543210"
    assert call["provider_call_id"] == "CA-test-1"
    assert call["direction"] == "inbound"


@pytest.mark.asyncio
async def test_duplicate_webhook_does_not_start_a_second_call(client, store):
    """Vendors retry webhooks; a retry must be idempotent."""
    first = await _incoming(client, store)
    second = await _incoming(client, store)

    assert second.json()["action"] == "already_started"
    assert second.json()["call_id"] == first.json()["call_id"]

    calls = await client.get(
        f"/api/v1/businesses/{store['business_id']}/calls",
        headers=auth_headers(store["owner_token"]),
    )
    assert len(calls.json()) == 1


@pytest.mark.asyncio
async def test_form_encoded_webhook_is_accepted(client, store):
    """Several vendors post form data rather than JSON."""
    response = await client.post(
        f"/api/v1/telephony/{store['business_id']}/incoming",
        data=_incoming_payload(call_sid="CA-form-1"),
    )

    assert response.status_code == 200
    assert response.json()["action"] == "answered"


@pytest.mark.asyncio
async def test_webhook_without_a_call_id_is_rejected(client, store):
    response = await client.post(
        f"/api/v1/telephony/{store['business_id']}/incoming", json={"From": "+919876543210"}
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_webhook_for_an_unknown_business_is_rejected(client):
    import uuid

    response = await client.post(
        f"/api/v1/telephony/{uuid.uuid4()}/incoming", json=_incoming_payload()
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_completed_status_ends_the_call_with_a_summary(client, store):
    started = await _incoming(client, store)
    call_id = started.json()["call_id"]
    await _say(client, store, call_id, "What is the iPhone 15 price?")

    response = await _status(
        client, store, {"CallSid": "CA-test-1", "CallStatus": "completed", "CallDuration": "42"}
    )
    call = await _get_call(client, store, call_id)

    assert response.json()["action"] == CallStatus.COMPLETED
    assert call["status"] == CallStatus.COMPLETED
    assert call["duration_seconds"] == 42
    assert call["summary"]


@pytest.mark.asyncio
async def test_no_answer_is_recorded_as_dropped(client, store):
    started = await _incoming(client, store)

    await _status(client, store, {"CallSid": "CA-test-1", "CallStatus": "no-answer"})
    call = await _get_call(client, store, started.json()["call_id"])

    assert call["status"] == CallStatus.NO_ANSWER
    assert call["outcome"] == CallOutcome.DROPPED


@pytest.mark.asyncio
async def test_busy_status_is_recorded(client, store):
    started = await _incoming(client, store)

    await _status(client, store, {"CallSid": "CA-test-1", "CallStatus": "busy"})
    call = await _get_call(client, store, started.json()["call_id"])

    assert call["status"] == CallStatus.BUSY


@pytest.mark.asyncio
async def test_unknown_status_event_is_ignored_safely(client, store):
    started = await _incoming(client, store)

    response = await _status(client, store, {"CallSid": "CA-test-1", "CallStatus": "something-new"})
    call = await _get_call(client, store, started.json()["call_id"])

    assert response.json()["action"] == "ignored"
    assert call["status"] == CallStatus.IN_PROGRESS


@pytest.mark.asyncio
async def test_status_for_an_unknown_call_is_rejected(client, store):
    response = await _status(
        client, store, {"CallSid": "CA-does-not-exist", "CallStatus": "completed"}
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_recording_url_is_ignored_without_consent(client, store):
    """A vendor may send a recording; we keep it only if the caller agreed."""
    started = await _incoming(client, store)
    call_id = started.json()["call_id"]

    await _status(
        client,
        store,
        {
            "CallSid": "CA-test-1",
            "CallStatus": "completed",
            "RecordingUrl": "https://vendor.example/rec/1.wav",
        },
    )
    call = await _get_call(client, store, call_id)

    assert call["recording_consent"] == RecordingConsent.NOT_ASKED
    assert call["recording_path"] is None


@pytest.mark.asyncio
async def test_recording_url_is_kept_when_consent_was_granted(client, store):
    started = await _incoming(client, store)
    call_id = started.json()["call_id"]

    await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/{call_id}/consent",
        json={"consent": RecordingConsent.GRANTED},
        headers=auth_headers(store["owner_token"]),
    )
    await _status(
        client,
        store,
        {
            "CallSid": "CA-test-1",
            "CallStatus": "completed",
            "RecordingUrl": "https://vendor.example/rec/1.wav",
        },
    )
    call = await _get_call(client, store, call_id)

    assert call["recording_path"] == "https://vendor.example/rec/1.wav"


def test_provider_parses_common_vendor_field_names():
    provider = MockTelephonyProvider()

    twilio = provider.parse_webhook(
        {"CallSid": "CA1", "From": "+91987", "CallStatus": "completed", "CallDuration": "30"}
    )
    generic = provider.parse_webhook(
        {"call_id": "X1", "from": "+91987", "status": "hangup", "duration": "12.7"}
    )

    assert twilio.provider_call_id == "CA1"
    assert twilio.duration_seconds == 30
    assert generic.provider_call_id == "X1"
    assert generic.duration_seconds == 12


@pytest.mark.asyncio
async def test_full_inbound_call_end_to_end(client, store):
    """A complete call: ring, converse, ask for details, hang up, summarise."""
    started = await _incoming(client, store)
    call_id = started.json()["call_id"]

    price = await _say(client, store, call_id, "iPhone 15 price entha?")
    assert price.json()["product_found"] is True
    assert "15000" in price.json()["grounding"]["prices"]

    stock = await _say(client, store, call_id, "Pixel 9 stock lo undha?")
    assert 5 in stock.json()["grounding"]["quantities"]

    policy = await _say(client, store, call_id, "What is your return policy?")
    assert policy.json()["knowledge_sources"]

    await _status(
        client,
        store,
        {"CallSid": "CA-test-1", "CallStatus": "completed", "CallDuration": "95"},
    )

    call = await _get_call(client, store, call_id)

    assert call["status"] == CallStatus.COMPLETED
    assert call["duration_seconds"] == 95
    assert call["outcome"]
    assert call["summary"]
    assert len([t for t in call["transcript"] if t["speaker"] == "customer"]) == 3
    # Nothing in the call was fabricated.
    assert all(
        not t["transcript_metadata"].get("blocked")
        for t in call["transcript"]
        if t["speaker"] == "ai"
    )
