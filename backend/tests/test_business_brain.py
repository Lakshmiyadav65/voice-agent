"""Structured retrieval behaviour, including the guardrail against fabrication."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.models.enums import BusinessMemberRole, ContentStatus, OfferStatus
from app.services import business_brain
from tests.conftest import auth_headers, create_user, login
from tests.factories import build_mobile_store

NOW = datetime(2026, 8, 28, 12, 0, tzinfo=UTC)


@pytest.fixture
async def store(client, db):
    return await build_mobile_store(client, db)


def _lookup_url(business_id: str) -> str:
    return f"/api/v1/businesses/{business_id}/lookup/product"


@pytest.mark.asyncio
async def test_exact_product_lookup_returns_price_and_stock(client, store):
    response = await client.get(
        _lookup_url(store["business_id"]),
        params={"name": "iPhone 15"},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["product_name"] == "iPhone 15"
    assert body["source"] == "structured_data"

    variant = body["variants"][0]
    assert Decimal(variant["price"]["price"]) == Decimal("15000.00")
    assert variant["price"]["currency"] == "INR"
    assert variant["stock"]["quantity"] == 12
    assert variant["stock"]["in_stock"] is True


@pytest.mark.asyncio
async def test_lookup_is_case_and_whitespace_insensitive(client, store):
    response = await client.get(
        _lookup_url(store["business_id"]),
        params={"name": "  iphone   15  "},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.json()["found"] is True


@pytest.mark.asyncio
async def test_unknown_product_returns_not_found_without_data(client, store):
    """The core guardrail: an absent product yields no product payload at all."""
    response = await client.get(
        _lookup_url(store["business_id"]),
        params={"name": "Samsung Galaxy S25"},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["found"] is False
    assert body["reason"] == "product_not_found"
    assert body["product_id"] is None
    assert body["product_name"] is None
    assert body["variants"] == []


@pytest.mark.asyncio
async def test_partial_name_does_not_match_a_different_product(client, store):
    """'iPhone' must not silently resolve to 'iPhone 15'."""
    response = await client.get(
        _lookup_url(store["business_id"]),
        params={"name": "iPhone"},
        headers=auth_headers(store["owner_token"]),
    )

    body = response.json()
    assert body["found"] is False
    assert body["product_name"] is None
    assert "iPhone 15" in body["suggestions"]


@pytest.mark.asyncio
async def test_unknown_variant_returns_not_found_with_alternatives(client, store):
    response = await client.get(
        _lookup_url(store["business_id"]),
        params={"name": "iPhone 15", "variant": "512GB"},
        headers=auth_headers(store["owner_token"]),
    )

    body = response.json()
    assert body["found"] is False
    assert body["reason"] == "variant_not_found"
    assert body["suggestions"] == ["128GB"]
    assert body["variants"] == []


@pytest.mark.asyncio
async def test_discontinued_product_is_not_returned(client, db, store):
    iphone = store["iphone"]
    await client.patch(
        f"/api/v1/businesses/{store['business_id']}/products/{iphone['product_id']}",
        json={"status": "discontinued"},
        headers=auth_headers(store["owner_token"]),
    )

    response = await client.get(
        _lookup_url(store["business_id"]),
        params={"name": "iPhone 15"},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.json()["found"] is False


@pytest.mark.asyncio
async def test_variant_without_price_reports_price_not_found(client, store):
    """A configured variant with no price must not borrow another variant's price."""
    iphone = store["iphone"]
    headers = auth_headers(store["owner_token"])

    await client.post(
        f"/api/v1/businesses/{store['business_id']}/products/{iphone['product_id']}/variants",
        json={"variant_name": "256GB", "sku": "IP15-256"},
        headers=headers,
    )

    response = await client.get(
        _lookup_url(store["business_id"]),
        params={"name": "iPhone 15", "variant": "256GB"},
        headers=headers,
    )

    variant = response.json()["variants"][0]
    assert variant["price"]["found"] is False
    assert variant["price"]["price"] is None


@pytest.mark.asyncio
async def test_variant_without_inventory_reports_stock_not_found(client, store):
    iphone = store["iphone"]
    headers = auth_headers(store["owner_token"])

    await client.post(
        f"/api/v1/businesses/{store['business_id']}/products/{iphone['product_id']}/variants",
        json={"variant_name": "256GB"},
        headers=headers,
    )

    response = await client.get(
        _lookup_url(store["business_id"]),
        params={"name": "iPhone 15", "variant": "256GB"},
        headers=headers,
    )

    stock = response.json()["variants"][0]["stock"]
    assert stock["found"] is False
    assert stock["in_stock"] is False


@pytest.mark.asyncio
async def test_zero_quantity_is_found_but_out_of_stock(client, db, store):
    """Known-and-zero is a different answer from unknown."""
    pixel = store["pixel"]
    await client.put(
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{pixel['product_id']}/variants/{pixel['variant_id']}/inventory",
        json={"quantity": 0, "location": "main"},
        headers=auth_headers(store["owner_token"]),
    )

    result = await business_brain.check_inventory(db, pixel["variant_uuid"])

    assert result.found is True
    assert result.in_stock is False
    assert result.quantity == 0


@pytest.mark.asyncio
async def test_inventory_sums_across_locations(client, db, store):
    pixel = store["pixel"]
    await client.put(
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{pixel['product_id']}/variants/{pixel['variant_id']}/inventory",
        json={"quantity": 3, "location": "warehouse"},
        headers=auth_headers(store["owner_token"]),
    )

    result = await business_brain.check_inventory(db, pixel["variant_uuid"])

    assert result.quantity == 8
    assert result.locations == {"main": 3, "warehouse": 5} or result.locations == {
        "main": 5,
        "warehouse": 3,
    }


@pytest.mark.asyncio
async def test_duplicate_product_name_is_rejected(client, store):
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/products",
        json={"name": "iphone 15"},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_duplicate_variant_name_is_rejected(client, store):
    iphone = store["iphone"]
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/products/{iphone['product_id']}/variants",
        json={"variant_name": "128GB"},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_staff_cannot_change_prices(client, db, store):
    staff = await create_user(db, "staff@srimobile.in")
    await client.post(
        f"/api/v1/businesses/{store['business_id']}/members",
        json={"email": staff.email, "role": BusinessMemberRole.STAFF},
        headers=auth_headers(store["owner_token"]),
    )
    staff_token = await login(client, staff.email)

    iphone = store["iphone"]
    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/products/"
        f"{iphone['product_id']}/variants/{iphone['variant_id']}/prices",
        json={"price": "1.00"},
        headers=auth_headers(staff_token),
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_products_are_isolated_between_businesses(client, db, store):
    other = await build_mobile_store(
        client, db, owner_email="priya@othermobile.in", business_name="Other Mobile"
    )

    cross_read = await client.get(
        f"/api/v1/businesses/{store['business_id']}/products",
        headers=auth_headers(other["owner_token"]),
    )
    own_lookup = await client.get(
        _lookup_url(other["business_id"]),
        params={"name": "iPhone 15"},
        headers=auth_headers(other["owner_token"]),
    )

    assert cross_read.status_code == 404
    assert own_lookup.json()["product_id"] != store["iphone"]["product_id"]


@pytest.mark.asyncio
async def test_product_not_reachable_through_another_business(client, db, store):
    other = await build_mobile_store(
        client, db, owner_email="priya@othermobile.in", business_name="Other Mobile"
    )

    response = await client.get(
        f"/api/v1/businesses/{other['business_id']}/products/{store['iphone']['product_id']}",
        headers=auth_headers(other["owner_token"]),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_offers_resolve_by_effective_window(client, db, store):
    headers = auth_headers(store["owner_token"])
    start = NOW + timedelta(hours=1)
    end = NOW + timedelta(hours=3)

    await client.post(
        f"/api/v1/businesses/{store['business_id']}/offers",
        json={
            "name": "Festive discount",
            "value": {"percent": 10},
            "effective_from": start.isoformat(),
            "effective_to": end.isoformat(),
        },
        headers=headers,
    )

    url = f"/api/v1/businesses/{store['business_id']}/offers"
    active_before = await client.get(
        url, params={"active_only": True, "at": NOW.isoformat()}, headers=headers
    )
    active_during = await client.get(
        url,
        params={"active_only": True, "at": (start + timedelta(minutes=30)).isoformat()},
        headers=headers,
    )
    active_after = await client.get(
        url,
        params={"active_only": True, "at": (end + timedelta(minutes=1)).isoformat()},
        headers=headers,
    )

    assert active_before.json() == []
    assert len(active_during.json()) == 1
    assert active_after.json() == []


@pytest.mark.asyncio
async def test_paused_offer_is_never_active(client, db, store):
    headers = auth_headers(store["owner_token"])

    created = await client.post(
        f"/api/v1/businesses/{store['business_id']}/offers",
        json={"name": "Old offer", "value": {"percent": 5}},
        headers=headers,
    )
    offer_id = created.json()["id"]

    await client.patch(
        f"/api/v1/businesses/{store['business_id']}/offers/{offer_id}",
        json={"status": OfferStatus.PAUSED},
        headers=headers,
    )

    active = await client.get(
        f"/api/v1/businesses/{store['business_id']}/offers",
        params={"active_only": True},
        headers=headers,
    )

    assert active.json() == []


@pytest.mark.asyncio
async def test_faqs_and_rules_round_trip(client, store):
    headers = auth_headers(store["owner_token"])
    business_id = store["business_id"]

    faq = await client.post(
        f"/api/v1/businesses/{business_id}/faqs",
        json={"question": "What is the return policy?", "answer": "7 days with receipt."},
        headers=headers,
    )
    rule = await client.post(
        f"/api/v1/businesses/{business_id}/rules",
        json={
            "name": "Escalate refunds",
            "rule_type": "escalation",
            "configuration": {"transfer_to_human": True},
        },
        headers=headers,
    )

    assert faq.status_code == 201
    assert faq.json()["status"] == ContentStatus.PUBLISHED
    assert rule.status_code == 201
    assert rule.json()["configuration"] == {"transfer_to_human": True}


@pytest.mark.asyncio
async def test_draft_faq_is_excluded_from_published_set(client, db, store):
    headers = auth_headers(store["owner_token"])
    business_id = store["business_id"]

    created = await client.post(
        f"/api/v1/businesses/{business_id}/faqs",
        json={"question": "Do you deliver?", "answer": "Yes, within the city."},
        headers=headers,
    )
    await client.patch(
        f"/api/v1/businesses/{business_id}/faqs/{created.json()['id']}",
        json={"status": ContentStatus.DRAFT},
        headers=headers,
    )

    published = await client.get(
        f"/api/v1/businesses/{business_id}/faqs",
        params={"published_only": True},
        headers=headers,
    )

    assert published.json() == []


@pytest.mark.asyncio
async def test_empty_product_query_is_rejected(client, store):
    response = await client.get(
        _lookup_url(store["business_id"]),
        params={"name": "   "},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 200
    assert response.json()["found"] is False
