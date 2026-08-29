import pytest

from app.models.enums import BusinessMemberRole, UserRole
from tests.conftest import auth_headers, create_user, login

MOBILE_STORE = {"name": "Sri Mobile Store", "industry": "retail", "timezone": "Asia/Kolkata"}
REALTY = {"name": "Skyline Realty", "industry": "real_estate"}


async def _business_for(client, db, email, payload, role=UserRole.BUSINESS_USER):
    user = await create_user(db, email, role=role)
    token = await login(client, user.email)
    response = await client.post("/api/v1/businesses", json=payload, headers=auth_headers(token))
    assert response.status_code == 201, response.text
    return user, token, response.json()["id"]


@pytest.mark.asyncio
async def test_creator_becomes_owner(client, db):
    _, token, business_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)

    response = await client.get(
        f"/api/v1/businesses/{business_id}/members", headers=auth_headers(token)
    )

    assert response.status_code == 200
    members = response.json()
    assert len(members) == 1
    assert members[0]["role"] == BusinessMemberRole.OWNER


@pytest.mark.asyncio
async def test_business_list_shows_only_own_businesses(client, db):
    _, ravi_token, _ = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    _, priya_token, _ = await _business_for(client, db, "priya@realty.in", REALTY)

    ravi_view = await client.get("/api/v1/businesses", headers=auth_headers(ravi_token))
    priya_view = await client.get("/api/v1/businesses", headers=auth_headers(priya_token))

    assert [b["name"] for b in ravi_view.json()] == ["Sri Mobile Store"]
    assert [b["name"] for b in priya_view.json()] == ["Skyline Realty"]


@pytest.mark.asyncio
async def test_cross_tenant_read_is_denied(client, db):
    _, _, mobile_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    _, priya_token, _ = await _business_for(client, db, "priya@realty.in", REALTY)

    response = await client.get(
        f"/api/v1/businesses/{mobile_id}", headers=auth_headers(priya_token)
    )

    # 404 rather than 403 so tenant existence is not leaked.
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_cross_tenant_write_is_denied(client, db):
    _, _, mobile_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    _, priya_token, _ = await _business_for(client, db, "priya@realty.in", REALTY)

    response = await client.patch(
        f"/api/v1/businesses/{mobile_id}",
        json={"name": "Hijacked Store"},
        headers=auth_headers(priya_token),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_cross_tenant_member_list_is_denied(client, db):
    _, _, mobile_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    _, priya_token, _ = await _business_for(client, db, "priya@realty.in", REALTY)

    response = await client.get(
        f"/api/v1/businesses/{mobile_id}/members", headers=auth_headers(priya_token)
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_cross_tenant_ai_employee_access_is_denied(client, db):
    _, ravi_token, mobile_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    _, priya_token, _ = await _business_for(client, db, "priya@realty.in", REALTY)

    created = await client.post(
        f"/api/v1/businesses/{mobile_id}/ai-employees",
        json={"name": "Priya", "description": "Sales assistant"},
        headers=auth_headers(ravi_token),
    )
    assert created.status_code == 201

    response = await client.get(
        f"/api/v1/businesses/{mobile_id}/ai-employees", headers=auth_headers(priya_token)
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_ai_employee_not_reachable_through_other_business(client, db):
    """An AI employee ID must not resolve when nested under a different tenant."""
    _, ravi_token, mobile_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    _, priya_token, realty_id = await _business_for(client, db, "priya@realty.in", REALTY)

    created = await client.post(
        f"/api/v1/businesses/{mobile_id}/ai-employees",
        json={"name": "Priya"},
        headers=auth_headers(ravi_token),
    )
    ai_employee_id = created.json()["id"]

    response = await client.get(
        f"/api/v1/businesses/{realty_id}/ai-employees/{ai_employee_id}",
        headers=auth_headers(priya_token),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_internal_trainer_sees_all_businesses(client, db):
    await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    await _business_for(client, db, "priya@realty.in", REALTY)

    trainer = await create_user(db, "trainer@platform.in", role=UserRole.AI_TRAINER)
    trainer_token = await login(client, trainer.email)

    response = await client.get("/api/v1/businesses", headers=auth_headers(trainer_token))

    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_internal_trainer_can_access_any_business(client, db):
    _, _, mobile_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)

    trainer = await create_user(db, "trainer@platform.in", role=UserRole.AI_TRAINER)
    trainer_token = await login(client, trainer.email)

    response = await client.get(
        f"/api/v1/businesses/{mobile_id}", headers=auth_headers(trainer_token)
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Sri Mobile Store"


@pytest.mark.asyncio
async def test_staff_member_cannot_write(client, db):
    _, owner_token, business_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    staff = await create_user(db, "staff@shop.in")

    invite = await client.post(
        f"/api/v1/businesses/{business_id}/members",
        json={"email": staff.email, "role": BusinessMemberRole.STAFF},
        headers=auth_headers(owner_token),
    )
    assert invite.status_code == 201

    staff_token = await login(client, staff.email)

    read = await client.get(f"/api/v1/businesses/{business_id}", headers=auth_headers(staff_token))
    write = await client.patch(
        f"/api/v1/businesses/{business_id}",
        json={"name": "Renamed by staff"},
        headers=auth_headers(staff_token),
    )

    assert read.status_code == 200
    assert write.status_code == 403


@pytest.mark.asyncio
async def test_manager_member_can_write(client, db):
    _, owner_token, business_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    manager = await create_user(db, "manager@shop.in")

    await client.post(
        f"/api/v1/businesses/{business_id}/members",
        json={"email": manager.email, "role": BusinessMemberRole.MANAGER},
        headers=auth_headers(owner_token),
    )
    manager_token = await login(client, manager.email)

    response = await client.patch(
        f"/api/v1/businesses/{business_id}",
        json={"industry": "electronics"},
        headers=auth_headers(manager_token),
    )

    assert response.status_code == 200
    assert response.json()["industry"] == "electronics"


@pytest.mark.asyncio
async def test_duplicate_member_invite_is_rejected(client, db):
    _, owner_token, business_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)
    staff = await create_user(db, "staff@shop.in")

    payload = {"email": staff.email, "role": BusinessMemberRole.STAFF}
    first = await client.post(
        f"/api/v1/businesses/{business_id}/members",
        json=payload,
        headers=auth_headers(owner_token),
    )
    second = await client.post(
        f"/api/v1/businesses/{business_id}/members",
        json=payload,
        headers=auth_headers(owner_token),
    )

    assert first.status_code == 201
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_last_owner_cannot_be_removed(client, db):
    _, owner_token, business_id = await _business_for(client, db, "ravi@shop.in", MOBILE_STORE)

    members = await client.get(
        f"/api/v1/businesses/{business_id}/members", headers=auth_headers(owner_token)
    )
    owner_member_id = members.json()[0]["id"]

    response = await client.delete(
        f"/api/v1/businesses/{business_id}/members/{owner_member_id}",
        headers=auth_headers(owner_token),
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_business_endpoints_require_authentication(client):
    unauthenticated = await client.get("/api/v1/businesses")
    assert unauthenticated.status_code == 401
