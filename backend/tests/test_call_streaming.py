"""Audio streaming over WebSocket.

The endpoint is driven directly with a fake socket so the streaming loop is
tested without a live server. The offline recogniser treats the audio payload as
UTF-8 text, so text fixtures stand in for speech.
"""

import uuid

import pytest

from app.api.v1.calls import stream_audio
from app.models.call import Call
from app.models.enums import CallStatus
from app.providers.offline import ContextOnlyLLMProvider, EchoSTTProvider, SilentTTSProvider
from app.providers.telephony import MockTelephonyProvider
from tests.conftest import auth_headers
from tests.factories import build_mobile_store


class FakeWebSocket:
    """Replays a scripted client and records what the server sent."""

    def __init__(self, incoming: list[dict]) -> None:
        self._incoming = list(incoming)
        self.accepted = False
        self.closed_with: tuple[int, str] | None = None
        self.json_sent: list[dict] = []
        self.bytes_sent: list[bytes] = []

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, code: int = 1000, reason: str = "") -> None:
        self.closed_with = (code, reason)

    async def receive(self) -> dict:
        if not self._incoming:
            return {"type": "websocket.disconnect"}
        return self._incoming.pop(0)

    async def send_json(self, payload: dict) -> None:
        self.json_sent.append(payload)

    async def send_bytes(self, payload: bytes) -> None:
        self.bytes_sent.append(payload)


def _audio(text: str) -> dict:
    return {"type": "websocket.receive", "bytes": text.encode("utf-8")}


@pytest.fixture
async def live_call(client, db, call_sessions, conversation_store):
    store = await build_mobile_store(client, db)

    started = await client.post(
        f"/api/v1/businesses/{store['business_id']}/calls",
        json={"phone_number": "9876543210"},
        headers=auth_headers(store["owner_token"]),
    )
    assert started.status_code == 201

    return {
        "store": store,
        "call_id": uuid.UUID(started.json()["id"]),
        "business_id": uuid.UUID(store["business_id"]),
        "sessions": call_sessions,
        "conversations": conversation_store,
    }


async def _stream(
    live_call, db, embedder, incoming, business_id=None, call_id=None, llm=None
) -> FakeWebSocket:
    socket = FakeWebSocket(incoming)

    await stream_audio(
        socket,
        business_id or live_call["business_id"],
        call_id or live_call["call_id"],
        db,
        live_call["sessions"],
        live_call["conversations"],
        llm or ContextOnlyLLMProvider(),
        embedder,
        EchoSTTProvider(),
        SilentTTSProvider(),
        MockTelephonyProvider(),
    )
    return socket


@pytest.mark.asyncio
async def test_audio_frame_produces_a_spoken_reply(live_call, db, embedder):
    socket = await _stream(live_call, db, embedder, [_audio("What is the iPhone 15 price?")])

    assert socket.accepted is True
    reply = socket.json_sent[0]
    assert reply["event"] == "reply"
    assert reply["text"]
    assert socket.bytes_sent, "synthesised audio should be streamed back"


@pytest.mark.asyncio
async def test_stream_transcribes_and_answers_in_tanglish(live_call, db, embedder):
    socket = await _stream(live_call, db, embedder, [_audio("iPhone 15 price entha?")])

    assert socket.json_sent[0]["language"] == "te-en"


@pytest.mark.asyncio
async def test_hangup_control_frame_ends_the_call(live_call, db, embedder):
    await _stream(
        live_call,
        db,
        embedder,
        [
            _audio("What is the iPhone 15 price?"),
            {"type": "websocket.receive", "text": "hangup"},
        ],
    )

    call = await db.get(Call, live_call["call_id"])
    await db.refresh(call)

    assert call.status == CallStatus.COMPLETED
    assert call.ended_at is not None
    assert call.summary


@pytest.mark.asyncio
async def test_dropped_connection_still_ends_the_call(live_call, db, embedder):
    """A caller hanging up abruptly must not leave the call open forever."""
    await _stream(live_call, db, embedder, [_audio("What is the iPhone 15 price?")])

    call = await db.get(Call, live_call["call_id"])
    await db.refresh(call)

    assert call.ended_at is not None
    assert call.summary
    assert live_call["call_id"] not in live_call["sessions"]


@pytest.mark.asyncio
async def test_multiple_turns_stream_in_sequence(live_call, db, embedder):
    socket = await _stream(
        live_call,
        db,
        embedder,
        [_audio("What is the iPhone 15 price?"), _audio("And the Pixel 9 price?")],
    )

    replies = [m for m in socket.json_sent if m["event"] == "reply"]
    assert len(replies) == 2


@pytest.mark.asyncio
async def test_escalation_closes_the_stream(live_call, db, embedder):
    socket = await _stream(
        live_call,
        db,
        embedder,
        [_audio("I want to speak to a manager"), _audio("Are you still there?")],
    )

    replies = [m for m in socket.json_sent if m["event"] == "reply"]
    assert len(replies) == 1
    assert replies[0]["escalated"] is True


@pytest.mark.asyncio
async def test_unknown_call_is_refused_before_accepting(live_call, db, embedder):
    socket = await _stream(live_call, db, embedder, [], call_id=uuid.uuid4())

    assert socket.accepted is False
    assert socket.closed_with == (4404, "Call not found")


@pytest.mark.asyncio
async def test_call_from_another_business_is_refused(client, db, embedder, live_call):
    other = await build_mobile_store(
        client, db, owner_email="priya@othermobile.in", business_name="Other Mobile"
    )

    socket = await _stream(live_call, db, embedder, [], business_id=uuid.UUID(other["business_id"]))

    assert socket.accepted is False
    assert socket.closed_with == (4404, "Call not found")


@pytest.mark.asyncio
async def test_recogniser_failure_asks_the_caller_to_repeat(live_call, db, embedder):
    """Unintelligible audio must prompt a retry, never a guess."""
    socket = await _stream(
        live_call, db, embedder, [{"type": "websocket.receive", "bytes": b"\xff\xfe\x00binary"}]
    )

    assert socket.json_sent[0]["event"] == "retry"


def test_websocket_route_is_registered():
    from app.api.v1.calls import router

    websocket_paths = [
        route.path for route in router.routes if type(route).__name__ == "APIWebSocketRoute"
    ]

    assert "/businesses/{business_id}/calls/{call_id}/stream" in websocket_paths
