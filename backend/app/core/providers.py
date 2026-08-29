"""Process-wide provider instances.

Kept behind accessor functions so tests and future production wiring can swap
implementations through FastAPI dependency overrides.
"""

from functools import lru_cache

from app.config import settings
from app.providers.base import (
    LLMProvider,
    STTProvider,
    TelephonyProvider,
    TTSProvider,
)
from app.providers.embeddings import EmbeddingProvider, HashingEmbeddingProvider
from app.providers.offline import (
    ContextOnlyLLMProvider,
    EchoSTTProvider,
    SilentTTSProvider,
)
from app.providers.storage import LocalFileStorage, StorageProvider
from app.providers.telephony import UnconfiguredTelephonyProvider
from app.services.conversation_state import ConversationStore


@lru_cache(maxsize=1)
def get_storage_provider() -> StorageProvider:
    return LocalFileStorage(settings.storage_root)


@lru_cache(maxsize=1)
def get_embedding_provider() -> EmbeddingProvider:
    return HashingEmbeddingProvider(dimensions=settings.embedding_dimensions)


@lru_cache(maxsize=1)
def get_llm_provider() -> LLMProvider:
    """No hosted model is configured yet; the offline provider keeps the
    conversation pipeline runnable end to end until one is."""
    return ContextOnlyLLMProvider()


@lru_cache(maxsize=1)
def get_stt_provider() -> STTProvider:
    return EchoSTTProvider()


@lru_cache(maxsize=1)
def get_tts_provider() -> TTSProvider:
    return SilentTTSProvider()


@lru_cache(maxsize=1)
def get_telephony_provider() -> TelephonyProvider:
    return UnconfiguredTelephonyProvider()


@lru_cache(maxsize=1)
def get_conversation_store() -> ConversationStore:
    return ConversationStore()


@lru_cache(maxsize=1)
def get_call_session_store() -> dict:
    """Live call sessions keyed by call id, held for the duration of the call."""
    return {}
