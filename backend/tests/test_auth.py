import pytest

from app.core.security import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    hash_password,
    user_id_from_token,
    verify_password,
)
from app.models.enums import UserRole
from tests.conftest import auth_headers, create_user, login

REGISTER_PAYLOAD = {
    "email": "owner@shop.in",
    "name": "Ravi Kumar",
    "password": "StrongPass123",
}


@pytest.mark.asyncio
async def test_register_creates_business_user(client):
    response = await client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "owner@shop.in"
    assert body["role"] == UserRole.BUSINESS_USER
    assert body["is_active"] is True
    assert "password" not in body
    assert "password_hash" not in body


@pytest.mark.asyncio
async def test_register_rejects_duplicate_email(client):
    await client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)

    duplicate = await client.post(
        "/api/v1/auth/register",
        json={**REGISTER_PAYLOAD, "email": "OWNER@SHOP.IN"},
    )

    assert duplicate.status_code == 409


@pytest.mark.asyncio
async def test_register_rejects_short_password(client):
    response = await client.post(
        "/api/v1/auth/register",
        json={**REGISTER_PAYLOAD, "password": "short"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_returns_token_pair(client):
    await client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@shop.in", "password": "StrongPass123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]


@pytest.mark.asyncio
async def test_login_rejects_wrong_password(client):
    await client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@shop.in", "password": "WrongPass123"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_rejects_unknown_email(client):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@shop.in", "password": "StrongPass123"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_current_user(client, db):
    user = await create_user(db, "trainer@platform.in", role=UserRole.AI_TRAINER)
    token = await login(client, user.email)

    response = await client.get("/api/v1/auth/me", headers=auth_headers(token))

    assert response.status_code == 200
    assert response.json()["email"] == "trainer@platform.in"
    assert response.json()["role"] == UserRole.AI_TRAINER


@pytest.mark.asyncio
async def test_me_requires_authentication(client):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_rejects_malformed_token(client):
    response = await client.get("/api/v1/auth/me", headers=auth_headers("not-a-real-token"))
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_issues_new_pair(client, db):
    user = await create_user(db, "owner@shop.in")
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "TestPass123"},
    )
    refresh_token = login_response.json()["refresh_token"]

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})

    assert response.status_code == 200
    assert response.json()["access_token"]


@pytest.mark.asyncio
async def test_access_token_rejected_on_refresh_endpoint(client, db):
    user = await create_user(db, "owner@shop.in")
    token = await login(client, user.email)

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_rejected_as_access_token(client, db):
    """A refresh token must not grant access to protected resources."""
    user = await create_user(db, "owner@shop.in")
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "TestPass123"},
    )
    refresh_token = login_response.json()["refresh_token"]

    response = await client.get("/api/v1/auth/me", headers=auth_headers(refresh_token))

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_inactive_user_cannot_login(client, db):
    user = await create_user(db, "owner@shop.in")
    user.is_active = False
    await db.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "TestPass123"},
    )

    assert response.status_code == 403


def test_password_hash_is_not_reversible():
    hashed = hash_password("StrongPass123")

    assert hashed != "StrongPass123"
    assert verify_password("StrongPass123", hashed)
    assert not verify_password("StrongPass124", hashed)


def test_password_over_bcrypt_limit_is_rejected():
    with pytest.raises(ValueError):
        hash_password("a" * 73)


def test_token_type_is_enforced():
    import uuid

    user_id = uuid.uuid4()

    assert user_id_from_token(create_access_token(user_id), "access") == user_id
    assert user_id_from_token(create_refresh_token(user_id), "refresh") == user_id

    with pytest.raises(InvalidTokenError):
        user_id_from_token(create_refresh_token(user_id), "access")
