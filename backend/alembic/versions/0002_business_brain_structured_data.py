"""Business Brain structured data: products, variants, prices, inventory, offers, FAQs, rules

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-28

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_TYPE = postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("brand", sa.String(length=255), nullable=True),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_products_business_id"), "products", ["business_id"])
    op.create_index("ix_products_business_name", "products", ["business_id", "name"])

    op.create_table(
        "product_variants",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("product_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("sku", sa.String(length=100), nullable=True),
        sa.Column("variant_name", sa.String(length=255), nullable=False),
        sa.Column("attributes", JSON_TYPE, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "variant_name", name="uq_product_variant"),
    )
    op.create_index(op.f("ix_product_variants_product_id"), "product_variants", ["product_id"])

    op.create_table(
        "product_prices",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("product_variant_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["product_variant_id"], ["product_variants.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_product_prices_product_variant_id"), "product_prices", ["product_variant_id"]
    )
    op.create_index(
        "ix_product_prices_variant_effective",
        "product_prices",
        ["product_variant_id", "effective_from"],
    )

    op.create_table(
        "inventory",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("product_variant_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["product_variant_id"], ["product_variants.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_variant_id", "location", name="uq_inventory_location"),
    )
    op.create_index(op.f("ix_inventory_product_variant_id"), "inventory", ["product_variant_id"])

    op.create_table(
        "offers",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("value", JSON_TYPE, nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_offers_business_id"), "offers", ["business_id"])

    op.create_table(
        "business_faqs",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_business_faqs_business_id"), "business_faqs", ["business_id"])

    op.create_table(
        "business_rules",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("rule_type", sa.String(length=50), nullable=False),
        sa.Column("configuration", JSON_TYPE, nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_business_rules_business_id"), "business_rules", ["business_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_business_rules_business_id"), table_name="business_rules")
    op.drop_table("business_rules")
    op.drop_index(op.f("ix_business_faqs_business_id"), table_name="business_faqs")
    op.drop_table("business_faqs")
    op.drop_index(op.f("ix_offers_business_id"), table_name="offers")
    op.drop_table("offers")
    op.drop_index(op.f("ix_inventory_product_variant_id"), table_name="inventory")
    op.drop_table("inventory")
    op.drop_index("ix_product_prices_variant_effective", table_name="product_prices")
    op.drop_index(op.f("ix_product_prices_product_variant_id"), table_name="product_prices")
    op.drop_table("product_prices")
    op.drop_index(op.f("ix_product_variants_product_id"), table_name="product_variants")
    op.drop_table("product_variants")
    op.drop_index("ix_products_business_name", table_name="products")
    op.drop_index(op.f("ix_products_business_id"), table_name="products")
    op.drop_table("products")
