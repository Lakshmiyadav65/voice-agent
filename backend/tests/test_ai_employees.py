import uuid

import pytest

from app.models.enums import AIEmployeeStatus, AIVersionStatus, UserRole
from tests.conftest import auth_headers, create_user, login


@pytest.fixture
async def tenant(client, db):
    owner = await create_user(db, "ravi@shop.in")
    owner_token = await login(client, owner.email)
    business = await client.post(
        "/api/v1/businesses",
        json={"name": "Sri Mobile Store", "industry": "retail"},
        headers=auth_headers(owner_token),
    )
    business_id = business.json()["id"]

    ai_employee = await client.post(
        f"/api/v1/businesses/{business_id}/ai-employees",
        json={"name": "Priya", "description": "Voice sales assistant"},
        headers=auth_headers(owner_token),
    )

    trainer = await create_user(db, "trainer@platform.in", role=UserRole.AI_TRAINER)
    trainer_token = await login(client, trainer.email)

    return {
        "business_id": business_id,
        "ai_employee_id": ai_employee.json()["id"],
        "owner_token": owner_token,
        "trainer_token": trainer_token,
    }


@pytest.mark.asyncio
async def test_ai_employee_starts_as_draft(client, tenant):
    response = await client.get(
        f"/api/v1/businesses/{tenant['business_id']}/ai-employees/{tenant['ai_employee_id']}",
        headers=auth_headers(tenant["owner_token"]),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Priya"
    assert body["status"] == AIEmployeeStatus.DRAFT
    assert body["current_version_id"] is None


@pytest.mark.asyncio
async def test_business_owner_cannot_create_ai_version(client, tenant):
    """Technical AI configuration stays out of business-owner reach."""
    response = await client.post(
        f"/api/v1/businesses/{tenant['business_id']}"
        f"/ai-employees/{tenant['ai_employee_id']}/versions",
        json={"configuration": {"tone": "friendly"}},
        headers=auth_headers(tenant["owner_token"]),
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_trainer_creates_versions_with_incrementing_numbers(client, tenant):
    base = (
        f"/api/v1/businesses/{tenant['business_id']}"
        f"/ai-employees/{tenant['ai_employee_id']}/versions"
    )
    headers = auth_headers(tenant["trainer_token"])

    first = await client.post(base, json={"configuration": {"tone": "friendly"}}, headers=headers)
    second = await client.post(base, json={"configuration": {"tone": "formal"}}, headers=headers)

    assert first.json()["version_number"] == 1
    assert second.json()["version_number"] == 2
    assert first.json()["status"] == AIVersionStatus.DRAFT


@pytest.mark.asyncio
async def test_unapproved_version_cannot_be_deployed(client, tenant):
    base = f"/api/v1/businesses/{tenant['business_id']}/ai-employees/{tenant['ai_employee_id']}"
    headers = auth_headers(tenant["trainer_token"])

    version = await client.post(
        f"{base}/versions", json={"configuration": {"tone": "friendly"}}, headers=headers
    )
    version_id = version.json()["id"]

    response = await client.post(f"{base}/versions/{version_id}/deploy", headers=headers)

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_approved_version_deploys_and_becomes_current(client, db, tenant):
    from app.models.ai_employee import AIVersion

    base = f"/api/v1/businesses/{tenant['business_id']}/ai-employees/{tenant['ai_employee_id']}"
    headers = auth_headers(tenant["trainer_token"])

    created = await client.post(
        f"{base}/versions", json={"configuration": {"tone": "friendly"}}, headers=headers
    )
    version_id = created.json()["id"]

    version = await db.get(AIVersion, uuid.UUID(version_id))
    version.status = AIVersionStatus.APPROVED
    await db.commit()

    deployed = await client.post(f"{base}/versions/{version_id}/deploy", headers=headers)
    ai_employee = await client.get(base, headers=auth_headers(tenant["owner_token"]))

    assert deployed.status_code == 200
    assert deployed.json()["status"] == AIVersionStatus.LIVE
    assert deployed.json()["deployed_at"] is not None
    assert ai_employee.json()["current_version_id"] == version_id


@pytest.mark.asyncio
async def test_deploying_new_version_archives_the_previous_live_version(client, db, tenant):
    from app.models.ai_employee import AIVersion

    base = f"/api/v1/businesses/{tenant['business_id']}/ai-employees/{tenant['ai_employee_id']}"
    headers = auth_headers(tenant["trainer_token"])

    version_ids = []
    for tone in ("friendly", "formal"):
        created = await client.post(
            f"{base}/versions", json={"configuration": {"tone": tone}}, headers=headers
        )
        version_id = created.json()["id"]
        version = await db.get(AIVersion, uuid.UUID(version_id))
        version.status = AIVersionStatus.APPROVED
        await db.commit()
        version_ids.append(version_id)

    await client.post(f"{base}/versions/{version_ids[0]}/deploy", headers=headers)
    await client.post(f"{base}/versions/{version_ids[1]}/deploy", headers=headers)

    versions = await client.get(f"{base}/versions", headers=headers)
    by_id = {v["id"]: v["status"] for v in versions.json()}

    assert by_id[version_ids[0]] == AIVersionStatus.ARCHIVED
    assert by_id[version_ids[1]] == AIVersionStatus.LIVE
