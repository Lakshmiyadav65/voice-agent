"""Builders for the controlled demo dataset from the implementation plan.

iPhone 15, 128GB, Rs 15,000, stock 12.
Pixel 9, 128GB, Rs 20,000, stock 5.
"""

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import UserRole
from tests.conftest import auth_headers, create_user, login

PAST = datetime(2020, 1, 1, tzinfo=UTC)

CATALOGUE = [
    {
        "key": "iphone",
        "name": "iPhone 15",
        "brand": "Apple",
        "category": "mobile",
        "variant": "128GB",
        "sku": "IP15-128",
        "price": "15000.00",
        "stock": 12,
    },
    {
        "key": "pixel",
        "name": "Pixel 9",
        "brand": "Google",
        "category": "mobile",
        "variant": "128GB",
        "sku": "PX9-128",
        "price": "20000.00",
        "stock": 5,
    },
]


async def build_mobile_store(
    client: AsyncClient,
    db: AsyncSession,
    owner_email: str = "ravi@srimobile.in",
    business_name: str = "Sri Mobile Store",
) -> dict:
    """Create an owner, a business, and the demo catalogue through the API."""
    owner = await create_user(db, owner_email)
    owner_token = await login(client, owner.email)
    headers = auth_headers(owner_token)

    business = await client.post(
        "/api/v1/businesses",
        json={"name": business_name, "industry": "retail"},
        headers=headers,
    )
    assert business.status_code == 201, business.text
    business_id = business.json()["id"]

    store: dict = {
        "business_id": business_id,
        "owner_token": owner_token,
        "owner_id": owner.id,
    }

    for item in CATALOGUE:
        product = await client.post(
            f"/api/v1/businesses/{business_id}/products",
            json={
                "name": item["name"],
                "brand": item["brand"],
                "category": item["category"],
            },
            headers=headers,
        )
        assert product.status_code == 201, product.text
        product_id = product.json()["id"]

        variant = await client.post(
            f"/api/v1/businesses/{business_id}/products/{product_id}/variants",
            json={
                "variant_name": item["variant"],
                "sku": item["sku"],
                "attributes": {"storage": item["variant"]},
            },
            headers=headers,
        )
        assert variant.status_code == 201, variant.text
        variant_id = variant.json()["id"]

        base = f"/api/v1/businesses/{business_id}/products/{product_id}/variants/{variant_id}"

        price = await client.post(
            f"{base}/prices",
            json={
                "price": item["price"],
                "currency": "INR",
                "effective_from": PAST.isoformat(),
            },
            headers=headers,
        )
        assert price.status_code == 201, price.text

        stock = await client.put(
            f"{base}/inventory",
            json={"quantity": item["stock"], "location": "main"},
            headers=headers,
        )
        assert stock.status_code == 200, stock.text

        store[item["key"]] = {
            "product_id": product_id,
            "product_uuid": uuid.UUID(product_id),
            "variant_id": variant_id,
            "variant_uuid": uuid.UUID(variant_id),
        }

    return store


async def add_trainer(client: AsyncClient, db: AsyncSession) -> str:
    trainer = await create_user(db, "trainer@platform.in", role=UserRole.AI_TRAINER)
    return await login(client, trainer.email)


def hours_from(moment: datetime, hours: int) -> datetime:
    return moment + timedelta(hours=hours)
