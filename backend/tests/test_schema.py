"""Guards that the declared models stay aligned with the migration history.

Migrations are executed against real PostgreSQL in CI. These checks catch the
cheaper mistake of adding a model without a matching migration.
"""

import re
from pathlib import Path

import app.models  # noqa: F401  — registers all tables
from app.core.database import Base

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "alembic" / "versions"

EXPECTED_TABLES = {
    # Phase 2 — tenancy and authentication
    "users",
    "businesses",
    "business_members",
    "ai_employees",
    "ai_versions",
    # Phase 3 — Business Brain structured data
    "products",
    "product_variants",
    "product_prices",
    "inventory",
    "offers",
    "business_faqs",
    "business_rules",
    # Phase 4 — knowledge base
    "knowledge_documents",
    "knowledge_chunks",
    # Phase 6 — CRM and scheduling
    "customers",
    "leads",
    "appointments",
    # Phase 7 — voice calls
    "calls",
    "call_transcripts",
}


def _tables_created_by_migrations() -> set[str]:
    created: set[str] = set()
    for path in MIGRATIONS_DIR.glob("*.py"):
        created.update(re.findall(r'op\.create_table\(\s*"([^"]+)"', path.read_text()))
    return created


def test_models_match_expected_tables():
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_every_model_table_has_a_migration():
    missing = set(Base.metadata.tables) - _tables_created_by_migrations()
    assert not missing, f"Models without a migration: {sorted(missing)}"


def test_no_migration_creates_an_unknown_table():
    extra = _tables_created_by_migrations() - set(Base.metadata.tables)
    assert not extra, f"Migrations create tables with no model: {sorted(extra)}"


TENANT_SCOPED_TABLES = (
    "business_members",
    "ai_employees",
    "products",
    "offers",
    "business_faqs",
    "business_rules",
    "knowledge_documents",
    "knowledge_chunks",
    "customers",
    "leads",
    "appointments",
    "calls",
)


def test_tenant_scoped_tables_carry_business_id():
    """Every business-owned table must be filterable by tenant."""
    for table_name in TENANT_SCOPED_TABLES:
        assert "business_id" in Base.metadata.tables[table_name].columns


def test_business_foreign_keys_cascade_on_delete():
    for table_name in TENANT_SCOPED_TABLES:
        table = Base.metadata.tables[table_name]
        fk = next(fk for fk in table.foreign_keys if fk.column.table.name == "businesses")
        assert fk.ondelete == "CASCADE"


def test_product_descendants_cascade_to_their_parent():
    """Deleting a business must not orphan prices or stock rows."""
    chain = {
        "product_variants": "products",
        "product_prices": "product_variants",
        "inventory": "product_variants",
    }
    for child, parent in chain.items():
        table = Base.metadata.tables[child]
        fk = next(fk for fk in table.foreign_keys if fk.column.table.name == parent)
        assert fk.ondelete == "CASCADE"


def test_knowledge_chunks_carry_tenant_for_filtered_retrieval():
    """Vector search filters by tenant directly, without joining documents."""
    columns = Base.metadata.tables["knowledge_chunks"].columns
    assert "business_id" in columns
    assert "embedding" in columns
    assert not columns["embedding"].nullable, "A chunk without an embedding is unsearchable"


def test_recording_consent_is_stored_alongside_the_recording():
    """Consent and path live on the same row so they are checked together."""
    columns = Base.metadata.tables["calls"].columns

    assert "recording_consent" in columns
    assert "recording_path" in columns
    assert not columns["recording_consent"].nullable
    assert columns["recording_path"].nullable


def test_transcripts_are_ordered_within_a_call():
    table = Base.metadata.tables["call_transcripts"]
    unique = {
        tuple(c.name for c in con.columns) for con in table.constraints if hasattr(con, "columns")
    }

    assert "sequence" in table.columns
    assert ("call_id", "sequence") in unique


def test_price_table_supports_effective_date_resolution():
    columns = Base.metadata.tables["product_prices"].columns
    assert "effective_from" in columns
    assert "effective_to" in columns
    assert columns["effective_to"].nullable, "An open-ended price must be expressible"
