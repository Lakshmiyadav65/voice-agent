"""Telephony implementations.

No vendor is configured yet. `MockTelephonyProvider` records what would have
happened so the whole call lifecycle can be exercised, and
`UnconfiguredTelephonyProvider` refuses outbound calls rather than silently
appearing to place them.
"""

import uuid
from typing import Any

from app.providers.base import CallEvent, ProviderError, TelephonyProvider

# Field names differ per vendor; this covers the common shapes so a real
# provider usually needs only a thin subclass.
CALL_ID_KEYS = ("CallSid", "call_id", "CallUUID", "uuid", "callId")
FROM_KEYS = ("From", "from", "caller_id", "src")
TO_KEYS = ("To", "to", "called_number", "dst")
EVENT_KEYS = ("CallStatus", "event", "status", "EventType")
RECORDING_KEYS = ("RecordingUrl", "recording_url", "RecordUrl")
DURATION_KEYS = ("CallDuration", "duration", "Duration")


def _first(payload: dict[str, Any], keys: tuple[str, ...], default: str = "") -> str:
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return str(value)
    return default


class MockTelephonyProvider(TelephonyProvider):
    """In-memory telephony, used by tests and local development."""

    def __init__(self) -> None:
        self.placed_calls: list[tuple[str, str]] = []
        self.hangups: list[str] = []
        self.transfers: list[tuple[str, str]] = []

    @property
    def name(self) -> str:
        return "mock-telephony"

    async def initiate_call(self, to_number: str, from_number: str) -> str:
        self.placed_calls.append((to_number, from_number))
        return f"mock-{uuid.uuid4()}"

    async def hangup(self, provider_call_id: str) -> None:
        self.hangups.append(provider_call_id)

    async def transfer(self, provider_call_id: str, to_number: str) -> None:
        self.transfers.append((provider_call_id, to_number))

    def parse_webhook(self, payload: dict[str, Any]) -> CallEvent:
        provider_call_id = _first(payload, CALL_ID_KEYS)
        if not provider_call_id:
            raise ProviderError(self.name, "Webhook has no call identifier")

        duration = _first(payload, DURATION_KEYS, "0")
        try:
            duration_seconds = int(float(duration))
        except ValueError:
            duration_seconds = 0

        return CallEvent(
            provider_call_id=provider_call_id,
            event=_first(payload, EVENT_KEYS, "unknown").lower(),
            from_number=_first(payload, FROM_KEYS),
            to_number=_first(payload, TO_KEYS),
            direction=str(payload.get("Direction") or payload.get("direction") or "inbound"),
            recording_url=_first(payload, RECORDING_KEYS) or None,
            duration_seconds=duration_seconds,
            raw=payload,
        )


class UnconfiguredTelephonyProvider(TelephonyProvider):
    """Active until a vendor is configured.

    Inbound webhooks are still parsed, so a provider pointed at this deployment
    is handled correctly, but outbound calls fail loudly instead of pretending.
    """

    @property
    def name(self) -> str:
        return "unconfigured-telephony"

    async def initiate_call(self, to_number: str, from_number: str) -> str:
        raise ProviderError(self.name, "No telephony provider is configured")

    async def hangup(self, provider_call_id: str) -> None:
        raise ProviderError(self.name, "No telephony provider is configured")

    async def transfer(self, provider_call_id: str, to_number: str) -> None:
        raise ProviderError(self.name, "No telephony provider is configured")

    def parse_webhook(self, payload: dict[str, Any]) -> CallEvent:
        return MockTelephonyProvider().parse_webhook(payload)
