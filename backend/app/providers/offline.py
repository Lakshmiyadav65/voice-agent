"""Offline provider implementations for development and testing.

These are deliberately not simulations of a real model. The LLM implementation
composes replies only from the context it is handed, which makes conversation
behaviour deterministic and lets the guardrail and state-machine logic be tested
without a vendor account. A hosted model implements the same interface.
"""

import hashlib
from typing import Any

from app.models.enums import Language
from app.providers.base import (
    Audio,
    LLMMessage,
    LLMProvider,
    LLMResponse,
    ProviderError,
    STTProvider,
    Transcript,
    TTSProvider,
)
from app.services.language import detect_language


class EchoSTTProvider(STTProvider):
    """Treats the audio payload as UTF-8 text.

    Lets the whole pipeline be exercised with text fixtures standing in for
    speech until a real recogniser is configured in Phase 7.
    """

    @property
    def name(self) -> str:
        return "echo-stt"

    async def transcribe(self, audio: bytes, language: Language | None = None) -> Transcript:
        try:
            text = audio.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ProviderError(self.name, "Audio payload is not decodable text") from exc

        detected = detect_language(text)
        return Transcript(
            text=text,
            language=language or detected.language,
            confidence=detected.confidence,
        )


class SilentTTSProvider(TTSProvider):
    """Produces a deterministic byte payload instead of real audio."""

    @property
    def name(self) -> str:
        return "silent-tts"

    async def synthesize(self, text: str, language: Language = Language.ENGLISH) -> Audio:
        digest = hashlib.blake2b(text.encode("utf-8"), digest_size=32).digest()
        return Audio(data=digest, content_type="audio/wav", language=language)


class ContextOnlyLLMProvider(LLMProvider):
    """Answers strictly from the retrieved context in the prompt.

    It never introduces a figure of its own, so a guardrail violation in tests
    means the pipeline supplied bad context rather than that the model
    hallucinated. Scripted replies can be injected to simulate a model that
    does misbehave.
    """

    def __init__(self, scripted_replies: list[str] | None = None) -> None:
        self._scripted = list(scripted_replies or [])

    @property
    def name(self) -> str:
        return "context-only-llm"

    def queue_reply(self, reply: str) -> None:
        self._scripted.append(reply)

    async def generate(
        self,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        if self._scripted:
            return LLMResponse(content=self._scripted.pop(0))

        facts = [m.content for m in messages if m.role == "system" and m.content.strip()]
        if facts:
            return LLMResponse(content=facts[-1])

        return LLMResponse(content="")


class FailingLLMProvider(LLMProvider):
    """Always fails, so provider-outage handling can be tested."""

    @property
    def name(self) -> str:
        return "failing-llm"

    async def generate(
        self,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        raise ProviderError(self.name, "Upstream model unavailable")
