"""Seed development data.

Creates the internal trainer, a demo business owner, and the controlled
mobile-store dataset used by the first demonstration scenario:

    iPhone 15, 128GB, Rs 15,000, stock 12
    Pixel 9,   128GB, Rs 20,000, stock 5

Run with: python -m app.scripts.seed
"""

import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.providers import get_embedding_provider, get_storage_provider
from app.core.security import hash_password
from app.models.ai_employee import AIEmployee
from app.models.business import Business, BusinessMember
from app.models.business_brain import BusinessFAQ, BusinessRule
from app.models.enums import (
    AIEmployeeStatus,
    BusinessMemberRole,
    BusinessStatus,
    DocumentSourceType,
    RuleType,
    UserRole,
)
from app.models.knowledge import KnowledgeDocument
from app.models.product import Inventory, Product, ProductPrice, ProductVariant
from app.models.user import User
from app.services.knowledge import ingest_document

# Backdated so the seeded prices are already in force.
PRICES_EFFECTIVE_FROM = datetime(2026, 1, 1, tzinfo=UTC)

CATALOGUE = [
    {
        "name": "iPhone 15",
        "brand": "Apple",
        "category": "mobile",
        "variant_name": "128GB",
        "sku": "IP15-128",
        "price": Decimal("15000.00"),
        "quantity": 12,
    },
    {
        "name": "Pixel 9",
        "brand": "Google",
        "category": "mobile",
        "variant_name": "128GB",
        "sku": "PX9-128",
        "price": Decimal("20000.00"),
        "quantity": 5,
    },
]

FAQS = [
    {
        "question": "What is your return policy?",
        "answer": "Returns are accepted within 7 days with the original receipt and packaging.",
    },
    {
        "question": "Do you offer EMI?",
        "answer": "Yes, EMI is available on major credit cards for purchases above Rs 10,000.",
    },
    {
        "question": "What are your store timings?",
        "answer": "The store is open from 10:00 AM to 9:00 PM, Monday to Saturday.",
    },
]

KNOWLEDGE_DOCUMENT = {
    "name": "Store Policies.txt",
    "content": """Return Policy

Any handset may be returned within 7 days of purchase, provided the original
receipt and the original packaging are presented at the store counter. Handsets
with physical damage are not eligible for return.

Warranty Coverage

All handsets carry a 12 month manufacturer warranty covering hardware defects.
Accidental damage, liquid damage, and unauthorised repairs are excluded from
warranty coverage.

Exchange Offers

Old handsets can be exchanged against a new purchase. The exchange value is
assessed at the counter and depends on the model, age, and condition.

Delivery

Home delivery is available within city limits and is free for orders above
Rs 10,000. Deliveries outside city limits take three to five working days.

Payment Options

We accept cash, UPI, debit cards, and credit cards. EMI is available on major
credit cards for purchases above Rs 10,000.
""",
}

RULES = [
    {
        "name": "Never quote unlisted prices",
        "rule_type": RuleType.RESTRICTION,
        "configuration": {"require_structured_price": True},
    },
    {
        "name": "Escalate refund disputes",
        "rule_type": RuleType.ESCALATION,
        "configuration": {"transfer_to_human": True, "triggers": ["refund", "complaint"]},
    },
]

SEED_USERS = [
    {
        "email": "admin@platform.in",
        "name": "Platform Admin",
        "role": UserRole.PLATFORM_ADMIN,
        "password": "AdminPass123",
    },
    {
        "email": "trainer@platform.in",
        "name": "AI Trainer",
        "role": UserRole.AI_TRAINER,
        "password": "TrainerPass123",
    },
    {
        "email": "ravi@srimobile.in",
        "name": "Ravi Kumar",
        "role": UserRole.BUSINESS_USER,
        "password": "OwnerPass123",
    },
]


async def get_or_create_user(db: AsyncSession, spec: dict) -> User:
    result = await db.execute(select(User).where(func.lower(User.email) == spec["email"]))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    user = User(
        email=spec["email"],
        name=spec["name"],
        role=spec["role"],
        password_hash=hash_password(spec["password"]),
    )
    db.add(user)
    await db.flush()
    return user


async def seed_catalogue(db: AsyncSession, business: Business) -> int:
    """Create any catalogue item that is missing. Safe to run repeatedly."""
    created = 0

    for item in CATALOGUE:
        result = await db.execute(
            select(Product).where(
                Product.business_id == business.id,
                Product.name == item["name"],
            )
        )
        if result.scalars().first() is not None:
            continue

        product = Product(
            business_id=business.id,
            name=item["name"],
            brand=item["brand"],
            category=item["category"],
        )
        db.add(product)
        await db.flush()

        variant = ProductVariant(
            product_id=product.id,
            variant_name=item["variant_name"],
            sku=item["sku"],
            attributes={"storage": item["variant_name"]},
        )
        db.add(variant)
        await db.flush()

        db.add(
            ProductPrice(
                product_variant_id=variant.id,
                price=item["price"],
                currency="INR",
                effective_from=PRICES_EFFECTIVE_FROM,
            )
        )
        db.add(
            Inventory(
                product_variant_id=variant.id,
                quantity=item["quantity"],
                location="main",
            )
        )
        created += 1

    return created


async def seed_knowledge(db: AsyncSession, business: Business) -> None:
    for faq in FAQS:
        result = await db.execute(
            select(BusinessFAQ).where(
                BusinessFAQ.business_id == business.id,
                BusinessFAQ.question == faq["question"],
            )
        )
        if result.scalars().first() is None:
            db.add(BusinessFAQ(business_id=business.id, **faq))

    for rule in RULES:
        result = await db.execute(
            select(BusinessRule).where(
                BusinessRule.business_id == business.id,
                BusinessRule.name == rule["name"],
            )
        )
        if result.scalars().first() is None:
            db.add(BusinessRule(business_id=business.id, **rule))


async def seed_documents(db: AsyncSession, business: Business) -> int:
    """Ingest the sample policy document through the real pipeline."""
    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.business_id == business.id,
            KnowledgeDocument.name == KNOWLEDGE_DOCUMENT["name"],
        )
    )
    if result.scalars().first() is not None:
        return 0

    await ingest_document(
        db,
        get_storage_provider(),
        get_embedding_provider(),
        business_id=business.id,
        filename=KNOWLEDGE_DOCUMENT["name"],
        data=KNOWLEDGE_DOCUMENT["content"].encode("utf-8"),
        content_type="text/plain",
        source_type=DocumentSourceType.MANUAL,
    )
    return 1


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        users = {spec["email"]: await get_or_create_user(db, spec) for spec in SEED_USERS}
        owner = users["ravi@srimobile.in"]

        result = await db.execute(select(Business).where(Business.name == "Sri Mobile Store"))
        business = result.scalar_one_or_none()

        if business is None:
            business = Business(
                name="Sri Mobile Store",
                industry="retail",
                phone="+919000000001",
                email="contact@srimobile.in",
                timezone="Asia/Kolkata",
                status=BusinessStatus.ACTIVE,
            )
            db.add(business)
            await db.flush()

            db.add(
                BusinessMember(
                    business_id=business.id,
                    user_id=owner.id,
                    role=BusinessMemberRole.OWNER,
                )
            )

            db.add(
                AIEmployee(
                    business_id=business.id,
                    name="Priya",
                    description="Voice sales assistant for English, Telugu, and Tanglish calls",
                    status=AIEmployeeStatus.DRAFT,
                )
            )

        products_created = await seed_catalogue(db, business)
        await seed_knowledge(db, business)
        await db.commit()

        documents_created = await seed_documents(db, business)

        print("Seed complete.")
        print(f"  Business: {business.name} ({business.id})")
        print(f"  Products created this run: {products_created}")
        print(f"  Documents ingested this run: {documents_created}")
        for spec in SEED_USERS:
            print(f"  {spec['role']:<16} {spec['email']} / {spec['password']}")


if __name__ == "__main__":
    asyncio.run(seed())
