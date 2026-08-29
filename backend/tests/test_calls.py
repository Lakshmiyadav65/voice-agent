"""Call lifecycle: sessions, transcripts, outcomes, consent, and failure."""

import pytest

from app.models.enums import (
    CallDirection,
    CallOutcome,
    CallStatus,
    EscalationReason,
    Language,
    RecordingConsent,
    TurnRole,
)
from tests.conftest import auth_headers
from tests.factories import build_mobile_store

POLICY_TEXT = """Return Policy

Handsets may be returned within 7 days of purchase with the original receipt.
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


async def _start_call(client, store, phone="9876543210", **kwargs):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls",
        json={"phone_number": phone, **kwargs},
        headers=auth_headers(store["owner_token"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


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
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_starting_a_call_creates_a_record_and_greeting(client, store):
    call = await _start_call(client, store)

    assert call["status"] == CallStatus.IN_PROGRESS
    assert call["direction"] == CallDirection.INBOUND
    assert call["phone_number"] == "9876543210"
    assert call["started_at"] is not None

    detail = await _get_call(client, store, call["id"])
    assert detail["transcript"][0]["speaker"] == TurnRole.AI
    assert "Sri Mobile Store" in detail["transcript"][0]["text"]


@pytest.mark.asyncio
async def test_a_customer_record_is_created_for_the_caller(client, store):
    call = await _start_call(client, store)

    assert call["customer_id"] is not None


@pytest.mark.asyncio
async def test_transcript_is_written_turn_by_turn(client, store):
    """A call that drops mid-way must still leave a reviewable record."""
    call = await _start_call(client, store)

    await _say(client, store, call["id"], "What is the iPhone 15 price?")
    detail = await _get_call(client, store, call["id"])

    speakers = [entry["speaker"] for entry in detail["transcript"]]
    assert speakers == [TurnRole.AI, TurnRole.CUSTOMER, TurnRole.AI]
    assert detail["status"] == CallStatus.IN_PROGRESS


@pytest.mark.asyncio
async def test_transcript_is_ordered_and_contiguous(client, store):
    call = await _start_call(client, store)

    await _say(client, store, call["id"], "What is the iPhone 15 price?")
    await _say(client, store, call["id"], "And the Pixel 9 price?")

    detail = await _get_call(client, store, call["id"])
    sequences = [entry["sequence"] for entry in detail["transcript"]]

    assert sequences == list(range(1, len(sequences) + 1))


@pytest.mark.asyncio
async def test_transcript_records_the_source_used(client, store):
    """Conversation review needs to see where each answer came from."""
    call = await _start_call(client, store)

    await _say(client, store, call["id"], "What is the iPhone 15 price?")
    detail = await _get_call(client, store, call["id"])

    ai_reply = detail["transcript"][-1]
    assert ai_reply["transcript_metadata"]["source"] == "structured_data"
    assert ai_reply["transcript_metadata"]["tools"]


@pytest.mark.asyncio
async def test_language_switch_is_captured_in_the_transcript(client, store):
    call = await _start_call(client, store)

    await _say(client, store, call["id"], "iPhone 15 price entha?")
    detail = await _get_call(client, store, call["id"])

    customer_turn = next(e for e in detail["transcript"] if e["speaker"] == TurnRole.CUSTOMER)
    assert customer_turn["language"] == Language.TANGLISH


@pytest.mark.asyncio
async def test_ending_a_call_computes_duration_and_summary(client, store):
    call = await _start_call(client, store)
    await _say(client, store, call["id"], "What is the iPhone 15 price?")

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/{call['id']}/end",
        json={},
        headers=auth_headers(store["owner_token"]),
    )
    ended = response.json()

    assert ended["status"] == CallStatus.COMPLETED
    assert ended["ended_at"] is not None
    assert ended["duration_seconds"] >= 0
    assert ended["summary"]
    assert "caller turns" in ended["summary"]


@pytest.mark.asyncio
async def test_summary_reports_the_sources_and_actions_used(client, store):
    call = await _start_call(client, store)
    await _say(client, store, call["id"], "What is the iPhone 15 price?")

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/{call['id']}/end",
        json={},
        headers=auth_headers(store["owner_token"]),
    )
    summary = response.json()["summary"]

    assert "structured_data" in summary
    assert "find_product" in summary


@pytest.mark.asyncio
async def test_a_call_with_no_conversation_is_marked_dropped(client, store):
    call = await _start_call(client, store)

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/{call['id']}/end",
        json={},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.json()["outcome"] == CallOutcome.DROPPED


@pytest.mark.asyncio
async def test_utterances_are_refused_after_the_call_ends(client, store):
    call = await _start_call(client, store)
    await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/{call['id']}/end",
        json={},
        headers=auth_headers(store["owner_token"]),
    )

    response = await _say(client, store, call["id"], "One more thing")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_asking_for_a_human_transfers_and_ends_the_call(client, store):
    call = await _start_call(client, store)

    await _say(client, store, call["id"], "I want to speak to a manager")
    detail = await _get_call(client, store, call["id"])

    assert detail["status"] == CallStatus.TRANSFERRED
    assert detail["outcome"] == CallOutcome.TRANSFERRED_TO_HUMAN
    assert detail["escalation_reason"] == EscalationReason.CUSTOMER_REQUEST
    assert "Escalated to a human" in detail["summary"]


@pytest.mark.asyncio
async def test_recording_is_not_stored_without_consent(client, store):
    """Recording only where permitted: no consent, no stored path."""
    from app.models.call import Call

    call = await _start_call(client, store)
    detail = await _get_call(client, store, call["id"])

    assert detail["recording_consent"] == RecordingConsent.NOT_ASKED
    assert detail["recording_path"] is None
    assert Call is not None


@pytest.mark.asyncio
async def test_withdrawing_consent_clears_the_recording(client, store):
    call = await _start_call(client, store)

    granted = await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/{call['id']}/consent",
        json={"consent": RecordingConsent.GRANTED},
        headers=auth_headers(store["owner_token"]),
    )
    declined = await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/{call['id']}/consent",
        json={"consent": RecordingConsent.DECLINED},
        headers=auth_headers(store["owner_token"]),
    )

    assert granted.json()["recording_consent"] == RecordingConsent.GRANTED
    assert declined.json()["recording_path"] is None


@pytest.mark.asyncio
async def test_outbound_call_fails_loudly_without_a_provider(client, store):
    """An unconfigured provider must not appear to place calls."""
    from app.core.providers import get_telephony_provider
    from app.main import app
    from app.providers.telephony import UnconfiguredTelephonyProvider

    app.dependency_overrides[get_telephony_provider] = lambda: UnconfiguredTelephonyProvider()

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/outbound",
        json={"to_number": "9876543210", "from_number": "9000000001"},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 503
    assert "No telephony provider" in response.json()["detail"]


@pytest.mark.asyncio
async def test_failed_outbound_dial_is_still_recorded(client, store):
    from app.core.providers import get_telephony_provider
    from app.main import app
    from app.providers.telephony import UnconfiguredTelephonyProvider

    app.dependency_overrides[get_telephony_provider] = lambda: UnconfiguredTelephonyProvider()

    await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/outbound",
        json={"to_number": "9876543210", "from_number": "9000000001"},
        headers=auth_headers(store["owner_token"]),
    )

    calls = await client.get(
        f"/api/v1/businesses/{store['business_id']}/calls",
        headers=auth_headers(store["owner_token"]),
    )
    failed = calls.json()[0]

    assert failed["status"] == CallStatus.FAILED
    assert failed["error"]


@pytest.mark.asyncio
async def test_outbound_call_uses_the_configured_provider(client, store, telephony):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls/outbound",
        json={"to_number": "9876543210", "from_number": "9000000001"},
        headers=auth_headers(store["owner_token"]),
    )
    call = response.json()

    assert response.status_code == 201
    assert call["direction"] == CallDirection.OUTBOUND
    assert call["provider_call_id"].startswith("mock-")
    assert telephony.placed_calls == [("9876543210", "9000000001")]


@pytest.mark.asyncio
async def test_calls_are_listed_newest_first(client, store):
    await _start_call(client, store, phone="9876543210")
    await _start_call(client, store, phone="9876543211")

    response = await client.get(
        f"/api/v1/businesses/{store['business_id']}/calls",
        headers=auth_headers(store["owner_token"]),
    )

    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_calls_are_isolated_between_businesses(client, db, store):
    other = await build_mobile_store(
        client, db, owner_email="priya@othermobile.in", business_name="Other Mobile"
    )
    call = await _start_call(client, store)

    cross = await client.get(
        f"/api/v1/businesses/{other['business_id']}/calls/{call['id']}",
        headers=auth_headers(other["owner_token"]),
    )
    listing = await client.get(
        f"/api/v1/businesses/{other['business_id']}/calls",
        headers=auth_headers(other["owner_token"]),
    )

    assert cross.status_code == 404
    assert listing.json() == []


@pytest.mark.asyncio
async def test_blocked_reply_is_flagged_in_the_transcript(client, store):
    """A guardrail block must be visible to whoever reviews the call."""
    from app.core.providers import get_llm_provider
    from app.main import app
    from app.providers.offline import ContextOnlyLLMProvider

    app.dependency_overrides[get_llm_provider] = lambda: ContextOnlyLLMProvider(
        scripted_replies=["The iPhone 15 is Rs 999."]
    )

    call = await _start_call(client, store)
    await _say(client, store, call["id"], "What is the iPhone 15 price?")

    detail = await _get_call(client, store, call["id"])
    ai_reply = detail["transcript"][-1]

    assert ai_reply["transcript_metadata"]["blocked"] is True
    assert "ungrounded_price" in ai_reply["transcript_metadata"]["violations"]
    assert "blocked by guardrails" in detail["summary"]
