"""Spoken date and time parsing.

The reference instant is Friday 28 Aug 2026, 11:30 IST (06:00 UTC).
"""

from datetime import UTC, datetime

import pytest

from app.services.datetime_parse import parse_datetime

NOW = datetime(2026, 8, 28, 6, 0, tzinfo=UTC)


def _parse(text: str):
    return parse_datetime(text, timezone="Asia/Kolkata", now=NOW)


def _ist(parsed):
    from zoneinfo import ZoneInfo

    return parsed.at.astimezone(ZoneInfo("Asia/Kolkata"))


def test_tomorrow_at_eleven_am():
    parsed = _parse("tomorrow at 11 AM")
    local = _ist(parsed)

    assert parsed.is_complete
    assert (local.day, local.hour, local.minute) == (29, 11, 0)


def test_today_at_a_later_hour():
    parsed = _parse("today at 5 PM")
    local = _ist(parsed)

    assert (local.day, local.hour) == (28, 17)


def test_time_already_past_rolls_to_tomorrow():
    """'at 9 AM' said at 11:30 means tomorrow morning."""
    parsed = _parse("at 9 AM")
    local = _ist(parsed)

    assert local.day == 29


def test_named_weekday_resolves_forward():
    parsed = _parse("Monday at 3 PM")
    local = _ist(parsed)

    assert (local.day, local.hour) == (31, 15)


def test_same_weekday_means_next_week():
    """Said on a Friday, 'Friday' means the following Friday."""
    parsed = _parse("Friday at 3 PM")
    local = _ist(parsed)

    assert local.day == 4  # 4 September


def test_tanglish_tomorrow():
    parsed = _parse("repu 11 gantalaki")
    local = _ist(parsed)

    assert (local.day, local.hour) == (29, 11)


def test_tanglish_today():
    parsed = _parse("ivala 5 PM")
    local = _ist(parsed)

    assert (local.day, local.hour) == (28, 17)


def test_day_after_tomorrow_in_telugu():
    parsed = _parse("ellundi 11 AM")
    local = _ist(parsed)

    assert local.day == 30


def test_minutes_are_preserved():
    parsed = _parse("tomorrow at 11:30 AM")
    local = _ist(parsed)

    assert (local.hour, local.minute) == (11, 30)


def test_evening_word_implies_pm():
    parsed = _parse("tomorrow evening at 6")
    local = _ist(parsed)

    assert local.hour == 18


def test_numeric_date_is_parsed():
    parsed = _parse("on 30/08 at 4 PM")
    local = _ist(parsed)

    assert (local.day, local.month, local.hour) == (30, 8, 16)


def test_date_without_time_is_incomplete():
    parsed = _parse("tomorrow")

    assert parsed is not None
    assert parsed.had_date is True
    assert parsed.had_time is False
    assert parsed.is_complete is False


@pytest.mark.parametrize(
    "text",
    [
        "sometime soon",
        "whenever you are free",
        "as early as possible",
    ],
)
def test_vague_expressions_return_nothing(text):
    """Rather than guess a slot, the parser declines so the AI can ask."""
    assert _parse(text) is None


def test_a_bare_price_is_not_read_as_a_time():
    """'15000' in a price sentence must not become a clock time."""
    assert _parse("the price is 15000") is None


def test_impossible_date_is_declined_rather_than_assumed():
    """A misheard date must not quietly become today."""
    assert _parse("on 32/13 at 4 PM") is None


def test_result_is_returned_in_utc():
    parsed = _parse("tomorrow at 11 AM")

    assert parsed.at.tzinfo is not None
    assert parsed.at.utcoffset().total_seconds() == 0
