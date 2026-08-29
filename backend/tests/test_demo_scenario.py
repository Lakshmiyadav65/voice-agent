"""The first demonstration scenario from the implementation plan.

Steps 1-4, 6 and 7 are exercised here. Step 5 (send details on WhatsApp) arrives
in Phase 8, and the routing that chooses between these sources arrives in
Phase 6; this file proves the structured data underneath answers correctly.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from tests.conftest import auth_headers
from tests.factories import build_mobile_store

IST_OFFSET = timedelta(hours=5, minutes=30)
TWO_PM_IST = datetime(2026, 8, 29, 14, 0, tzinfo=UTC) - IST_OFFSET


@pytest.fixture
async def store(client, db):
    return await build_mobile_store(client, db)


async def _lookup(client, store, name, at=None):
    params = {"name": name}
    if at is not None:
        params["at"] = at.isoformat()

    response = await client.get(
        f"/api/v1/businesses/{store['business_id']}/lookup/product",
        params=params,
        headers=auth_headers(store["owner_token"]),
    )
    assert response.status_code == 200
    return response.json()


@pytest.mark.asyncio
async def test_full_demonstration_scenario(client, db, store):
    # 1. "iPhone 15 price entha?"
    iphone = await _lookup(client, store, "iPhone 15")
    assert iphone["found"] is True
    iphone_price = Decimal(iphone["variants"][0]["price"]["price"])
    assert iphone_price == Decimal("15000.00")

    # 2. "What about Pixel 9?" — a fresh lookup, not a reuse of the previous answer.
    pixel = await _lookup(client, store, "Pixel 9")
    assert pixel["found"] is True
    pixel_price = Decimal(pixel["variants"][0]["price"]["price"])
    assert pixel_price == Decimal("20000.00")

    # 3. Comparison is arithmetic over two retrieved facts, never an estimate.
    assert pixel_price - iphone_price == Decimal("5000.00")

    # 4. "Pixel 9 stock lo undha?"
    pixel_stock = pixel["variants"][0]["stock"]
    assert pixel_stock["found"] is True
    assert pixel_stock["in_stock"] is True
    assert pixel_stock["quantity"] == 5

    # 6. Schedule the iPhone to Rs 17,000 at 2:00 PM.
    iphone_ids = store["iphone"]
    scheduled = await client.post(
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{iphone_ids['product_id']}/variants/{iphone_ids['variant_id']}/prices",
        json={"price": "17000.00", "effective_from": TWO_PM_IST.isoformat()},
        headers=auth_headers(store["owner_token"]),
    )
    assert scheduled.status_code == 201

    # 7. Verify the new price after the effective time, and that nothing else moved.
    after = await _lookup(client, store, "iPhone 15", at=TWO_PM_IST + timedelta(minutes=1))
    pixel_after = await _lookup(client, store, "Pixel 9", at=TWO_PM_IST + timedelta(minutes=1))

    assert Decimal(after["variants"][0]["price"]["price"]) == Decimal("17000.00")
    assert Decimal(pixel_after["variants"][0]["price"]["price"]) == Decimal("20000.00")


@pytest.mark.asyncio
async def test_unknown_product_in_scenario_is_refused(client, store):
    """A product the store does not carry must not produce a price."""
    result = await _lookup(client, store, "OnePlus 13")

    assert result["found"] is False
    assert result["variants"] == []
    assert result["product_name"] is None
