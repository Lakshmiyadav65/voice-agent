"""Provider interfaces.

Every external capability sits behind one of these so a vendor can be replaced
without touching conversation logic. Implementations must translate their own
failures into `ProviderError` so the engine can respond truthfully rather than
leaking a stack trace into a phone call.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.models.enums import Language


class ProviderError(Exception):
    """A provider could not complete the request."""

    def __init__(self, provider: str, message: str) -> None:
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.message = message


@dataclass
class Transcript:
    text: str
    language: Language = Language.UNKNOWN
    confidence: float = 1.0
    is_final: bool = True


@dataclass
class LLMMessage:
    role: str
    content: str


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    finish_reason: str = "stop"


@dataclass
class Audio:
    data: bytes
    content_type: str = "audio/wav"
    language: Language = Language.ENGLISH


class STTProvider(ABC):
    """Speech to text."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def transcribe(self, audio: bytes, language: Language | None = None) -> Transcript: ...


class LLMProvider(ABC):
    """Conversational model."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def generate(
        self,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse: ...


class TTSProvider(ABC):
    """Text to speech."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def synthesize(self, text: str, language: Language = Language.ENGLISH) -> Audio: ...


@dataclass
class CallEvent:
    """A telephony webhook normalised into provider-independent form."""

    provider_call_id: str
    event: str
    from_number: str = ""
    to_number: str = ""
    direction: str = "inbound"
    recording_url: str | None = None
    duration_seconds: int = 0
    raw: dict[str, Any] = field(default_factory=dict)


class TelephonyProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def initiate_call(self, to_number: str, from_number: str) -> str:
        """Place an outbound call and return the provider's call id."""

    @abstractmethod
    async def hangup(self, provider_call_id: str) -> None: ...

    @abstractmethod
    async def transfer(self, provider_call_id: str, to_number: str) -> None:
        """Hand a live call to a human."""

    @abstractmethod
    def parse_webhook(self, payload: dict[str, Any]) -> CallEvent:
        """Translate a provider webhook into a `CallEvent`."""


class WhatsAppProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def send_message(self, to_number: str, message: str) -> dict[str, Any]: ...
