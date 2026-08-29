"""Tool execution: validation, real effects, logging, and honest failure."""

from datetime import UTC, datetime

import pytest

from app.models.enums import ToolName, ToolStatus
from app.providers.base import ProviderError, WhatsAppProvider
from app.services.tools import TOOL_SPECS, ToolExecutor, tool_schemas
from tests.factories import build_mobile_store

# A Friday, so weekday arithmetic in tests is predictable.
NOW = datetime(2026, 8, 28, 6, 0, tzinfo=UTC)


class RecordingWhatsApp(WhatsAppProvider):
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    @property
    def name(self) -> str:
        return "recording-whatsapp"

    async def send_message(self, to_number: str, message: str) -> dict:
        self.sent.append((to_number, message))
        return {"message_id": "wamid.test", "status": "accepted"}


class BrokenWhatsApp(WhatsAppProvider):
    @property
    def name(self) -> str:
        return "broken-whatsapp"

    async def send_message(self, to_number: str, message: str) -> dict:
        raise ProviderError(self.name, "Gateway rejected the message")


@pytest.fixture
async def store(client, db):
    return await build_mobile_store(client, db)


def _executor(db, store, embedder=None, whatsapp=None):
    import uuid

    return ToolExecutor(
        db,
        uuid.UUID(store["business_id"]),
        embedder=embedder,
        whatsapp=whatsapp,
        now=NOW,
    )


@pytest.mark.asyncio
async def test_find_product_returns_current_price(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.FIND_PRODUCT, {"product_name": "iPhone 15"})

    assert result.ok
    assert result.data["variants"][0]["price"] == "15000.00"


@pytest.mark.asyncio
async def test_find_product_reports_not_found_without_data(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.FIND_PRODUCT, {"product_name": "OnePlus 13"})

    assert result.status is ToolStatus.NOT_FOUND
    assert "price" not in result.data


@pytest.mark.asyncio
async def test_missing_required_argument_is_rejected(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.FIND_PRODUCT, {})

    assert result.status is ToolStatus.INVALID_INPUT
    assert "product_name" in result.message


@pytest.mark.asyncio
async def test_wrong_argument_type_is_rejected(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.FIND_PRODUCT, {"product_name": 12345})

    assert result.status is ToolStatus.INVALID_INPUT


@pytest.mark.asyncio
async def test_check_inventory_returns_live_stock(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.CHECK_INVENTORY, {"product_name": "Pixel 9"})

    assert result.ok
    assert result.data["quantity"] == 5
    assert result.data["in_stock"] is True


@pytest.mark.asyncio
async def test_search_knowledge_without_embedder_is_unavailable(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.SEARCH_KNOWLEDGE, {"query": "return policy"})

    assert result.status is ToolStatus.UNAVAILABLE


@pytest.mark.asyncio
async def test_check_availability_understands_tomorrow_at_eleven(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.CHECK_AVAILABILITY, {"when": "tomorrow at 11 AM"})

    assert result.ok
    assert result.data["available"] is True
    # 11:00 IST on 29 Aug is 05:30 UTC.
    assert result.data["requested"].startswith("2026-08-29T05:30")


@pytest.mark.asyncio
async def test_unparseable_time_is_rejected_not_guessed(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.CHECK_AVAILABILITY, {"when": "sometime soon"})

    assert result.status is ToolStatus.INVALID_INPUT


@pytest.mark.asyncio
async def test_date_without_a_time_asks_for_the_time(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.CHECK_AVAILABILITY, {"when": "tomorrow"})

    assert result.status is ToolStatus.INVALID_INPUT
    assert result.data["needs"] == "time"


@pytest.mark.asyncio
async def test_booking_creates_an_appointment_and_customer(db, store):
    executor = _executor(db, store)

    result = await executor.run(
        ToolName.BOOK_APPOINTMENT,
        {"when": "tomorrow at 11 AM", "phone": "9876543210", "name": "Ravi"},
    )

    assert result.ok
    assert result.data["appointment_id"]
    assert result.data["customer_id"]


@pytest.mark.asyncio
async def test_double_booking_the_same_slot_is_refused(db, store):
    executor = _executor(db, store)
    booking = {"when": "tomorrow at 11 AM", "phone": "9876543210"}

    first = await executor.run(ToolName.BOOK_APPOINTMENT, booking)
    second = await executor.run(ToolName.BOOK_APPOINTMENT, {**booking, "phone": "9876500000"})

    assert first.ok
    assert second.status is ToolStatus.UNAVAILABLE


@pytest.mark.asyncio
async def test_availability_offers_alternatives_when_taken(db, store):
    executor = _executor(db, store)
    await executor.run(
        ToolName.BOOK_APPOINTMENT, {"when": "tomorrow at 11 AM", "phone": "9876543210"}
    )

    result = await executor.run(ToolName.CHECK_AVAILABILITY, {"when": "tomorrow at 11 AM"})

    assert result.data["available"] is False
    assert result.data["alternatives"]


@pytest.mark.asyncio
async def test_invalid_phone_is_rejected(db, store):
    executor = _executor(db, store)

    result = await executor.run(
        ToolName.BOOK_APPOINTMENT, {"when": "tomorrow at 11 AM", "phone": "123"}
    )

    assert result.status is ToolStatus.INVALID_INPUT


@pytest.mark.asyncio
async def test_create_lead_records_the_caller(db, store):
    executor = _executor(db, store)

    result = await executor.run(
        ToolName.CREATE_LEAD,
        {
            "phone": "9876543210",
            "name": "Ravi",
            "requirement": "iPhone 15",
            "budget": "20000",
        },
    )

    assert result.ok
    assert result.data["lead_id"]


@pytest.mark.asyncio
async def test_lead_reuses_an_existing_customer(db, store):
    executor = _executor(db, store)

    first = await executor.run(ToolName.CREATE_LEAD, {"phone": "9876543210"})
    second = await executor.run(ToolName.CREATE_LEAD, {"phone": "9876543210"})

    assert first.data["customer_id"] == second.data["customer_id"]
    assert first.data["lead_id"] != second.data["lead_id"]


@pytest.mark.asyncio
async def test_non_numeric_budget_is_rejected(db, store):
    executor = _executor(db, store)

    result = await executor.run(
        ToolName.CREATE_LEAD, {"phone": "9876543210", "budget": "quite a lot"}
    )

    assert result.status is ToolStatus.INVALID_INPUT


@pytest.mark.asyncio
async def test_update_crm_changes_lead_status(db, store):
    executor = _executor(db, store)
    lead = await executor.run(ToolName.CREATE_LEAD, {"phone": "9876543210"})

    result = await executor.run(
        ToolName.UPDATE_CRM, {"lead_id": lead.data["lead_id"], "status": "qualified"}
    )

    assert result.ok
    assert result.data["status"] == "qualified"


@pytest.mark.asyncio
async def test_update_crm_rejects_an_unknown_status(db, store):
    executor = _executor(db, store)
    lead = await executor.run(ToolName.CREATE_LEAD, {"phone": "9876543210"})

    result = await executor.run(
        ToolName.UPDATE_CRM, {"lead_id": lead.data["lead_id"], "status": "banana"}
    )

    assert result.status is ToolStatus.INVALID_INPUT


@pytest.mark.asyncio
async def test_crm_update_cannot_reach_another_tenants_lead(client, db, store):
    other = await build_mobile_store(
        client, db, owner_email="priya@othermobile.in", business_name="Other Mobile"
    )
    other_executor = _executor(db, other)
    lead = await other_executor.run(ToolName.CREATE_LEAD, {"phone": "9876543210"})

    executor = _executor(db, store)
    result = await executor.run(ToolName.UPDATE_CRM, {"lead_id": lead.data["lead_id"]})

    assert result.status is ToolStatus.NOT_FOUND


@pytest.mark.asyncio
async def test_whatsapp_without_a_provider_never_claims_success(db, store):
    """The App Flow rule: a failed send must never be reported as delivered."""
    executor = _executor(db, store)

    result = await executor.run(
        ToolName.SEND_WHATSAPP, {"phone": "9876543210", "message": "Details"}
    )

    assert result.status is ToolStatus.UNAVAILABLE
    assert not result.ok


@pytest.mark.asyncio
async def test_whatsapp_send_succeeds_with_a_provider(db, store):
    provider = RecordingWhatsApp()
    executor = _executor(db, store, whatsapp=provider)

    result = await executor.run(
        ToolName.SEND_WHATSAPP, {"phone": "+91 98765 43210", "message": "Details"}
    )

    assert result.ok
    assert provider.sent[0][0] == "919876543210"


@pytest.mark.asyncio
async def test_provider_failure_is_reported_as_unavailable(db, store):
    executor = _executor(db, store, whatsapp=BrokenWhatsApp())

    result = await executor.run(
        ToolName.SEND_WHATSAPP, {"phone": "9876543210", "message": "Details"}
    )

    assert result.status is ToolStatus.UNAVAILABLE
    assert "Gateway rejected" in result.message


@pytest.mark.asyncio
async def test_brochure_for_an_unknown_product_is_not_sent(db, store):
    provider = RecordingWhatsApp()
    executor = _executor(db, store, whatsapp=provider)

    result = await executor.run(
        ToolName.SEND_BROCHURE, {"phone": "9876543210", "product_name": "OnePlus 13"}
    )

    assert result.status is ToolStatus.NOT_FOUND
    assert provider.sent == []


@pytest.mark.asyncio
async def test_every_call_is_logged(db, store):
    executor = _executor(db, store)

    await executor.run(ToolName.FIND_PRODUCT, {"product_name": "iPhone 15"})
    await executor.run(ToolName.FIND_PRODUCT, {})
    await executor.run(ToolName.CHECK_INVENTORY, {"product_name": "Pixel 9"})

    assert len(executor.call_log) == 3
    assert [call.status for call in executor.call_log] == [
        ToolStatus.SUCCESS,
        ToolStatus.INVALID_INPUT,
        ToolStatus.SUCCESS,
    ]
    assert all(call.arguments is not None for call in executor.call_log)


@pytest.mark.asyncio
async def test_transfer_to_human_always_succeeds(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.TRANSFER_TO_HUMAN, {"reason": "customer_request"})

    assert result.ok
    assert result.data["reason"] == "customer_request"


def test_every_tool_publishes_a_schema():
    schemas = tool_schemas()

    assert len(schemas) == len(TOOL_SPECS)
    for schema in schemas:
        assert schema["function"]["name"]
        assert schema["function"]["description"]


def test_booking_requires_both_a_time_and_a_phone_number():
    spec = TOOL_SPECS[ToolName.BOOK_APPOINTMENT]

    assert "duration_minutes" in spec.parameters
    assert "when" in spec.required
    assert "phone" in spec.required


@pytest.mark.asyncio
async def test_booking_far_in_the_future_uses_the_named_weekday(db, store):
    executor = _executor(db, store)

    result = await executor.run(ToolName.CHECK_AVAILABILITY, {"when": "Monday at 3 PM"})

    # 28 Aug 2026 is a Friday, so the next Monday is 31 Aug.
    assert result.ok
    assert result.data["requested"].startswith("2026-08-31T09:30")
