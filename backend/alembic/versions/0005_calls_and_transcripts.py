"""Voice calls and transcripts

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_TYPE = postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "calls",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("ai_employee_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("lead_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("phone_number", sa.String(length=20), nullable=False),
        sa.Column("provider_call_id", sa.String(length=255), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("outcome", sa.String(length=50), nullable=True),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("recording_consent", sa.String(length=20), nullable=False),
        sa.Column("recording_path", sa.String(length=1024), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("escalation_reason", sa.String(length=50), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("call_metadata", JSON_TYPE, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ai_employee_id"], ["ai_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "provider_call_id", name="uq_call_provider_id"),
    )
    op.create_index(op.f("ix_calls_business_id"), "calls", ["business_id"])
    op.create_index(op.f("ix_calls_customer_id"), "calls", ["customer_id"])
    op.create_index("ix_calls_business_started", "calls", ["business_id", "started_at"])

    op.create_table(
        "call_transcripts",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("call_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("speaker", sa.String(length=20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("spoken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("transcript_metadata", JSON_TYPE, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("call_id", "sequence", name="uq_call_transcript_sequence"),
    )
    op.create_index(op.f("ix_call_transcripts_call_id"), "call_transcripts", ["call_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_call_transcripts_call_id"), table_name="call_transcripts")
    op.drop_table("call_transcripts")
    op.drop_index("ix_calls_business_started", table_name="calls")
    op.drop_index(op.f("ix_calls_customer_id"), table_name="calls")
    op.drop_index(op.f("ix_calls_business_id"), table_name="calls")
    op.drop_table("calls")
