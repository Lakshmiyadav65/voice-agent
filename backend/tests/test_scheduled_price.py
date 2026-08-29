"""The Phase 3 critical test from the implementation plan.

Current price is Rs 15,000. A change to Rs 17,000 is scheduled for 2:00 PM.
Before 2:00 PM a lookup must return 15,000; after 2:00 PM it must return 17,000
with no retraining, redeployment, or write of any kind at the boundary.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.services import business_brain
from tests.conftest import auth_headers
from tests.factories import build_mobile_store

IST_OFFSET = timedelta(hours=5, minutes=30)

# 29 Aug 2026, 2:00 PM IST, expressed in UTC.
EFFECTIVE_AT = datetime(2026, 8, 29, 14, 0, tzinfo=UTC) - IST_OFFSET
BEFORE = EFFECTIVE_AT - timedelta(minutes=1)
AFTER = EFFECTIVE_AT + timedelta(minutes=1)


@pytest.fixture
async def store(client, db):
    return await build_mobile_store(client, db)


@pytest.mark.asyncio
async def test_scheduled_price_activates_at_effective_time(client, db, store):
    """The full critical scenario, driven entirely through the API."""
    iphone = store["iphone"]
    base = (
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{iphone['product_id']}/variants/{iphone['variant_id']}"
    )
    headers = auth_headers(store["owner_token"])

    scheduled = await client.post(
        f"{base}/prices",
        json={
            "price": "17000.00",
            "currency": "INR",
            "effective_from": EFFECTIVE_AT.isoformat(),
        },
        headers=headers,
    )
    assert scheduled.status_code == 201

    lookup_url = f"/api/v1/businesses/{store['business_id']}/lookup/product"

    before = await client.get(
        lookup_url,
        params={"name": "iPhone 15", "variant": "128GB", "at": BEFORE.isoformat()},
        headers=headers,
    )
    after = await client.get(
        lookup_url,
        params={"name": "iPhone 15", "variant": "128GB", "at": AFTER.isoformat()},
        headers=headers,
    )

    assert before.status_code == 200
    assert after.status_code == 200

    price_before = Decimal(before.json()["variants"][0]["price"]["price"])
    price_after = Decimal(after.json()["variants"][0]["price"]["price"])

    assert price_before == Decimal("15000.00")
    assert price_after == Decimal("17000.00")


@pytest.mark.asyncio
async def test_price_resolution_at_exact_effective_moment(client, db, store):
    """The boundary itself belongs to the new price."""
    iphone = store["iphone"]
    await client.post(
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{iphone['product_id']}/variants/{iphone['variant_id']}/prices",
        json={"price": "17000.00", "effective_from": EFFECTIVE_AT.isoformat()},
        headers=auth_headers(store["owner_token"]),
    )

    at_boundary = await business_brain.resolve_price(db, iphone["variant_uuid"], EFFECTIVE_AT)

    assert at_boundary.found
    assert at_boundary.price == Decimal("17000.00")


@pytest.mark.asyncio
async def test_scheduled_change_is_visible_before_it_activates(client, db, store):
    """A pending change must be inspectable without altering the live answer."""
    iphone = store["iphone"]
    base = (
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{iphone['product_id']}/variants/{iphone['variant_id']}"
    )
    headers = auth_headers(store["owner_token"])

    await client.post(
        f"{base}/prices",
        json={"price": "17000.00", "effective_from": EFFECTIVE_AT.isoformat()},
        headers=headers,
    )

    pending = await client.get(
        f"{base}/prices/scheduled", params={"at": BEFORE.isoformat()}, headers=headers
    )
    live = await business_brain.resolve_price(db, iphone["variant_uuid"], BEFORE)

    assert pending.status_code == 200
    assert len(pending.json()) == 1
    assert Decimal(pending.json()[0]["price"]) == Decimal("17000.00")
    assert live.price == Decimal("15000.00")


@pytest.mark.asyncio
async def test_scheduled_change_disappears_once_active(client, db, store):
    iphone = store["iphone"]
    base = (
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{iphone['product_id']}/variants/{iphone['variant_id']}"
    )
    headers = auth_headers(store["owner_token"])

    await client.post(
        f"{base}/prices",
        json={"price": "17000.00", "effective_from": EFFECTIVE_AT.isoformat()},
        headers=headers,
    )

    pending = await client.get(
        f"{base}/prices/scheduled", params={"at": AFTER.isoformat()}, headers=headers
    )

    assert pending.json() == []


@pytest.mark.asyncio
async def test_latest_of_several_scheduled_changes_wins(client, db, store):
    """Chained changes each take over in turn."""
    iphone = store["iphone"]
    base = (
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{iphone['product_id']}/variants/{iphone['variant_id']}"
    )
    headers = auth_headers(store["owner_token"])

    second_change = EFFECTIVE_AT + timedelta(days=1)

    await client.post(
        f"{base}/prices",
        json={"price": "17000.00", "effective_from": EFFECTIVE_AT.isoformat()},
        headers=headers,
    )
    await client.post(
        f"{base}/prices",
        json={"price": "16000.00", "effective_from": second_change.isoformat()},
        headers=headers,
    )

    variant_id = iphone["variant_uuid"]
    first_window = await business_brain.resolve_price(db, variant_id, AFTER)
    second_window = await business_brain.resolve_price(
        db, variant_id, second_change + timedelta(minutes=1)
    )

    assert first_window.price == Decimal("17000.00")
    assert second_window.price == Decimal("16000.00")


@pytest.mark.asyncio
async def test_price_before_any_effective_row_is_not_found(client, db, store):
    """No invented fallback when nothing was in force yet."""
    iphone = store["iphone"]
    before_catalogue_existed = datetime(2019, 1, 1, tzinfo=UTC)

    result = await business_brain.resolve_price(
        db, iphone["variant_uuid"], before_catalogue_existed
    )

    assert not result.found
    assert result.price is None


@pytest.mark.asyncio
async def test_closed_price_window_expires(client, db, store):
    """A price with an `effective_to` stops applying after that moment."""
    pixel = store["pixel"]
    base = (
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{pixel['product_id']}/variants/{pixel['variant_id']}"
    )
    headers = auth_headers(store["owner_token"])

    promo_start = EFFECTIVE_AT
    promo_end = EFFECTIVE_AT + timedelta(hours=2)

    await client.post(
        f"{base}/prices",
        json={
            "price": "18000.00",
            "effective_from": promo_start.isoformat(),
            "effective_to": promo_end.isoformat(),
        },
        headers=headers,
    )

    during = await business_brain.resolve_price(
        db, pixel["variant_uuid"], promo_start + timedelta(minutes=30)
    )
    after_promo = await business_brain.resolve_price(
        db, pixel["variant_uuid"], promo_end + timedelta(minutes=1)
    )

    assert during.price == Decimal("18000.00")
    assert after_promo.price == Decimal("20000.00")


@pytest.mark.asyncio
async def test_effective_to_must_follow_effective_from(client, store):
    iphone = store["iphone"]

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{iphone['product_id']}/variants/{iphone['variant_id']}/prices",
        json={
            "price": "17000.00",
            "effective_from": EFFECTIVE_AT.isoformat(),
            "effective_to": BEFORE.isoformat(),
        },
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 422
