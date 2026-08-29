"""Knowledge ingestion and retrieval, including source metadata and isolation."""

import pytest

from app.models.enums import DocumentStatus
from tests.conftest import auth_headers
from tests.factories import build_mobile_store

RETURN_POLICY = """Return Policy

Any handset may be returned within 7 days of purchase, provided the original
receipt and packaging are presented at the store counter.

Warranty Coverage

All handsets carry a 12 month manufacturer warranty covering hardware defects.
Accidental damage and liquid damage are excluded from warranty coverage.

Delivery

Home delivery is available within city limits and is free for orders above
Rs 10,000. Deliveries outside city limits take three to five working days.
"""


@pytest.fixture
async def store(client, db):
    return await build_mobile_store(client, db)


async def _upload_text(client, store, name, content):
    return await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents/text",
        json={"name": name, "content": content},
        headers=auth_headers(store["owner_token"]),
    )


async def _search(client, store, query, token=None, **kwargs):
    return await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/search",
        json={"query": query, **kwargs},
        headers=auth_headers(token or store["owner_token"]),
    )


@pytest.mark.asyncio
async def test_upload_runs_the_full_pipeline(client, store):
    response = await _upload_text(client, store, "Store Policies", RETURN_POLICY)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == DocumentStatus.READY
    assert body["chunk_count"] >= 1
    assert body["error"] is None
    assert body["doc_metadata"]["embedding_model"] == "hashing-384"


@pytest.mark.asyncio
async def test_file_upload_is_parsed_and_chunked(client, store):
    files = {"file": ("policies.md", RETURN_POLICY.encode("utf-8"), "text/markdown")}

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents",
        files=files,
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 201
    assert response.json()["status"] == DocumentStatus.READY


@pytest.mark.asyncio
async def test_retrieval_finds_the_relevant_passage(client, store):
    await _upload_text(client, store, "Store Policies", RETURN_POLICY)

    response = await _search(client, store, "What is the return policy?")

    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert "7 days" in body["hits"][0]["content"]


@pytest.mark.asyncio
async def test_every_hit_carries_source_metadata(client, store):
    """A retrieved statement must always be traceable to its document."""
    await _upload_text(client, store, "Store Policies", RETURN_POLICY)

    response = await _search(client, store, "warranty coverage")
    hit = response.json()["hits"][0]

    assert hit["document_name"] == "Store Policies.txt"
    assert hit["document_id"]
    assert hit["chunk_index"] >= 0
    assert hit["score"] > 0
    assert hit["metadata"]["char_start"] >= 0
    assert hit["metadata"]["embedding_model"] == "hashing-384"
    assert response.json()["source"] == "knowledge_base"


@pytest.mark.asyncio
async def test_unrelated_question_returns_nothing(client, store):
    """Retrieving nothing is the honest answer when nothing was stored."""
    await _upload_text(client, store, "Store Policies", RETURN_POLICY)

    response = await _search(client, store, "astronaut training schedule", min_score=0.3)

    body = response.json()
    assert body["found"] is False
    assert body["hits"] == []


@pytest.mark.asyncio
async def test_search_with_no_documents_returns_empty(client, store):
    response = await _search(client, store, "return policy")

    assert response.json()["found"] is False
    assert response.json()["hits"] == []


@pytest.mark.asyncio
async def test_results_are_ordered_by_relevance(client, store):
    await _upload_text(client, store, "Delivery", "Home delivery is free above Rs 10,000.")
    await _upload_text(client, store, "Warranty", "Warranty covers hardware defects only.")

    response = await _search(client, store, "warranty hardware defects")
    hits = response.json()["hits"]

    assert hits[0]["document_name"] == "Warranty.txt"
    assert hits[0]["score"] >= hits[-1]["score"]


@pytest.mark.asyncio
async def test_top_k_limits_results(client, store):
    for index in range(6):
        await _upload_text(client, store, f"Doc {index}", f"Delivery note number {index}.")

    response = await _search(client, store, "delivery note", top_k=3)

    assert len(response.json()["hits"]) <= 3


@pytest.mark.asyncio
async def test_knowledge_is_isolated_between_businesses(client, db, store):
    """One business must never retrieve another's documents."""
    other = await build_mobile_store(
        client, db, owner_email="priya@othermobile.in", business_name="Other Mobile"
    )
    await _upload_text(client, store, "Secret Policy", "Our secret margin is 40 percent.")

    own = await _search(client, store, "secret margin")
    cross = await client.post(
        f"/api/v1/businesses/{other['business_id']}/knowledge/search",
        json={"query": "secret margin"},
        headers=auth_headers(other["owner_token"]),
    )

    assert own.json()["found"] is True
    assert cross.json()["found"] is False
    assert cross.json()["hits"] == []


@pytest.mark.asyncio
async def test_cross_tenant_document_list_is_denied(client, db, store):
    other = await build_mobile_store(
        client, db, owner_email="priya@othermobile.in", business_name="Other Mobile"
    )

    response = await client.get(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents",
        headers=auth_headers(other["owner_token"]),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_document_not_reachable_through_another_business(client, db, store):
    other = await build_mobile_store(
        client, db, owner_email="priya@othermobile.in", business_name="Other Mobile"
    )
    created = await _upload_text(client, store, "Policies", RETURN_POLICY)
    document_id = created.json()["id"]

    response = await client.get(
        f"/api/v1/businesses/{other['business_id']}/knowledge/documents/{document_id}",
        headers=auth_headers(other["owner_token"]),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_unsupported_file_type_is_rejected(client, store):
    files = {"file": ("logo.png", b"\x89PNG\r\n\x1a\n binary", "image/png")}

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents",
        files=files,
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 422
    assert "Unsupported file type" in response.json()["detail"]


@pytest.mark.asyncio
async def test_failed_upload_is_recorded_not_silently_dropped(client, store):
    files = {"file": ("logo.png", b"\x89PNG binary", "image/png")}
    await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents",
        files=files,
        headers=auth_headers(store["owner_token"]),
    )

    documents = await client.get(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents",
        headers=auth_headers(store["owner_token"]),
    )
    failed = documents.json()[0]

    assert failed["status"] == DocumentStatus.FAILED
    assert failed["error"]
    assert failed["chunk_count"] == 0


@pytest.mark.asyncio
async def test_failed_document_contributes_no_chunks_to_search(client, store):
    files = {"file": ("logo.png", b"\x89PNG binary", "image/png")}
    await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents",
        files=files,
        headers=auth_headers(store["owner_token"]),
    )

    response = await _search(client, store, "png binary")

    assert response.json()["hits"] == []


@pytest.mark.asyncio
async def test_empty_upload_is_rejected(client, store):
    files = {"file": ("empty.txt", b"", "text/plain")}

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents",
        files=files,
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_csv_rows_become_readable_sentences(client, store):
    csv_bytes = b"model,storage,warranty\niPhone 15,128GB,12 months\nPixel 9,128GB,24 months\n"
    files = {"file": ("catalogue.csv", csv_bytes, "text/csv")}

    upload = await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents",
        files=files,
        headers=auth_headers(store["owner_token"]),
    )
    chunks = await client.get(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents/"
        f"{upload.json()['id']}/chunks",
        headers=auth_headers(store["owner_token"]),
    )

    content = chunks.json()[0]["content"]
    assert "model: Pixel 9" in content
    assert "warranty: 24 months" in content


@pytest.mark.asyncio
async def test_deleting_a_document_removes_its_chunks(client, store):
    created = await _upload_text(client, store, "Policies", RETURN_POLICY)
    document_id = created.json()["id"]

    deleted = await client.delete(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents/{document_id}",
        headers=auth_headers(store["owner_token"]),
    )
    search = await _search(client, store, "return policy 7 days")

    assert deleted.status_code == 204
    assert search.json()["hits"] == []


@pytest.mark.asyncio
async def test_staff_cannot_upload_documents(client, db, store):
    from app.models.enums import BusinessMemberRole
    from tests.conftest import create_user, login

    staff = await create_user(db, "staff@srimobile.in")
    await client.post(
        f"/api/v1/businesses/{store['business_id']}/members",
        json={"email": staff.email, "role": BusinessMemberRole.STAFF},
        headers=auth_headers(store["owner_token"]),
    )
    staff_token = await login(client, staff.email)

    upload = await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents/text",
        json={"name": "Sneaky", "content": "Unauthorised knowledge."},
        headers=auth_headers(staff_token),
    )
    search = await _search(client, store, "return policy", token=staff_token)

    assert upload.status_code == 403
    assert search.status_code == 200


@pytest.mark.asyncio
async def test_chunks_are_indexed_in_document_order(client, store):
    created = await _upload_text(client, store, "Policies", RETURN_POLICY)

    chunks = await client.get(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents/"
        f"{created.json()['id']}/chunks",
        headers=auth_headers(store["owner_token"]),
    )
    indexes = [chunk["chunk_index"] for chunk in chunks.json()]

    assert indexes == sorted(indexes)
    assert indexes == list(range(len(indexes)))


@pytest.mark.asyncio
async def test_reembed_rebuilds_chunks_from_the_stored_original(client, store):
    created = await _upload_text(client, store, "Policies", RETURN_POLICY)
    document_id = created.json()["id"]
    original_count = created.json()["chunk_count"]

    response = await client.post(
        f"/api/v1/businesses/{store['business_id']}/knowledge/documents/{document_id}/reembed",
        headers=auth_headers(store["owner_token"]),
    )
    search = await _search(client, store, "return policy")

    assert response.status_code == 200
    assert response.json()["chunk_count"] == original_count
    assert search.json()["found"] is True


@pytest.mark.asyncio
async def test_get_search_endpoint_matches_post(client, store):
    await _upload_text(client, store, "Policies", RETURN_POLICY)

    response = await client.get(
        f"/api/v1/businesses/{store['business_id']}/knowledge/search",
        params={"q": "return policy"},
        headers=auth_headers(store["owner_token"]),
    )

    assert response.status_code == 200
    assert response.json()["found"] is True
