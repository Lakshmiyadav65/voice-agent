from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  — registers all tables on Base.metadata
from app.core.database import Base, get_db
from app.core.providers import (
    get_call_session_store,
    get_conversation_store,
    get_embedding_provider,
    get_storage_provider,
    get_telephony_provider,
)
from app.core.security import hash_password
from app.main import app
from app.models.enums import UserRole
from app.models.user import User
from app.providers.embeddings import HashingEmbeddingProvider
from app.providers.storage import InMemoryStorage
from app.providers.telephony import MockTelephonyProvider
from app.services.conversation_state import ConversationStore

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_engine():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest.fixture
async def session_factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def db(session_factory) -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        yield session


@pytest.fixture
def storage() -> InMemoryStorage:
    return InMemoryStorage()


@pytest.fixture
def embedder() -> HashingEmbeddingProvider:
    return HashingEmbeddingProvider(dimensions=384)


@pytest.fixture
def telephony() -> MockTelephonyProvider:
    return MockTelephonyProvider()


@pytest.fixture
def call_sessions() -> dict:
    """Fresh live-call registry per test, so sessions never leak between them."""
    return {}


@pytest.fixture
def conversation_store() -> ConversationStore:
    return ConversationStore()


@pytest.fixture
async def client(
    session_factory, storage, embedder, telephony, call_sessions, conversation_store
) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_storage_provider] = lambda: storage
    app.dependency_overrides[get_embedding_provider] = lambda: embedder
    app.dependency_overrides[get_telephony_provider] = lambda: telephony
    app.dependency_overrides[get_call_session_store] = lambda: call_sessions
    app.dependency_overrides[get_conversation_store] = lambda: conversation_store

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


async def create_user(
    db: AsyncSession,
    email: str,
    password: str = "TestPass123",
    name: str = "Test User",
    role: UserRole = UserRole.BUSINESS_USER,
) -> User:
    user = User(
        email=email.lower(),
        name=name,
        role=role,
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def login(client: AsyncClient, email: str, password: str = "TestPass123") -> str:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
