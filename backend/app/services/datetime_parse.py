"""Resolve spoken date and time expressions to an exact instant.

Callers say "tomorrow at 11 AM" or "repu 11 gantalaki", not ISO timestamps.
Parsing is deliberately conservative: an expression that is not clearly
understood returns nothing, so the AI asks rather than booking the wrong slot.

Everything resolves in the business timezone and is returned in UTC.
"""

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
    # Telugu weekday names in Latin script
    "somavaram": 0,
    "mangalavaram": 1,
    "budhavaram": 2,
    "guruvaram": 3,
    "shukravaram": 4,
    "shanivaram": 5,
    "adivaram": 6,
}

TODAY_WORDS = {"today", "ivala", "eeroju", "iyala"}
TOMORROW_WORDS = {"tomorrow", "repu", "rEpu", "reepu"}
DAY_AFTER_WORDS = {"ellundi", "elundi"}

# "11 AM", "11:30 pm", "11 o'clock"
CLOCK_PATTERN = re.compile(
    r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|o'?clock)?\b",
    re.IGNORECASE,
)

# Telugu time markers: "11 gantalaki", "11 ki"
TELUGU_TIME_PATTERN = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(?:gantala?ki|gantalu|ki)\b")

MORNING_WORDS = {"morning", "udayam", "podduna"}
AFTERNOON_WORDS = {"afternoon", "madhyahnam"}
EVENING_WORDS = {"evening", "sayantram", "saayantram"}
NIGHT_WORDS = {"night", "ratri"}

# Outside these hours a spoken time is almost certainly the other half of the
# clock; used only when the caller gave no AM/PM marker.
ASSUMED_BUSINESS_START = 9
ASSUMED_BUSINESS_END = 21


@dataclass
class ParsedDateTime:
    at: datetime
    had_date: bool
    had_time: bool
    text: str

    @property
    def is_complete(self) -> bool:
        return self.had_date and self.had_time


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z']+", text.lower()))


NUMERIC_DATE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b")


@dataclass
class _DateResult:
    value: date | None
    had_date: bool
    invalid: bool = False
    # Text with the date expression removed, so its digits are not later
    # mistaken for a clock time.
    remainder: str = ""


def _resolve_date(text: str, today: date) -> _DateResult:
    words = _words(text)

    if words & TODAY_WORDS:
        return _DateResult(today, True, remainder=text)
    if words & TOMORROW_WORDS:
        return _DateResult(today + timedelta(days=1), True, remainder=text)
    if words & DAY_AFTER_WORDS:
        return _DateResult(today + timedelta(days=2), True, remainder=text)

    for word in words:
        if word in WEEKDAYS:
            target = WEEKDAYS[word]
            ahead = (target - today.weekday()) % 7
            # "on Monday" said on a Monday means the next one.
            return _DateResult(today + timedelta(days=ahead or 7), True, remainder=text)

    numeric = NUMERIC_DATE.search(text)
    if numeric:
        day, month, year = numeric.groups()
        resolved_year = today.year if year is None else int(year)
        if resolved_year < 100:
            resolved_year += 2000

        remainder = text[: numeric.start()] + " " + text[numeric.end() :]
        try:
            return _DateResult(date(resolved_year, int(month), int(day)), True, remainder=remainder)
        except ValueError:
            # An impossible date is a misheard date. Declining is safer than
            # quietly booking today.
            return _DateResult(None, False, invalid=True, remainder=remainder)

    return _DateResult(None, False, remainder=text)


def _resolve_time(text: str) -> tuple[time | None, bool]:
    lowered = text.lower()
    words = _words(lowered)

    telugu = TELUGU_TIME_PATTERN.search(lowered)
    if telugu:
        hour = int(telugu.group(1))
        minute = int(telugu.group(2) or 0)
        return _apply_meridiem(hour, minute, None, words), True

    for match in CLOCK_PATTERN.finditer(lowered):
        hour = int(match.group(1))
        minute = int(match.group(2) or 0)
        marker = (match.group(3) or "").replace(".", "").replace("'", "")

        if hour > 24 or minute > 59:
            continue
        # A bare number with no marker and no time-of-day word is more likely a
        # price or quantity than a time.
        if not marker and not (words & (MORNING_WORDS | AFTERNOON_WORDS | EVENING_WORDS)):
            if not re.search(r"\bat\b|\bby\b", lowered):
                continue

        return _apply_meridiem(hour, minute, marker, words), True

    return None, False


def _apply_meridiem(hour: int, minute: int, marker: str | None, words: set[str]) -> time:
    marker = (marker or "").lower()

    if marker.startswith("p") and hour < 12:
        hour += 12
    elif marker.startswith("a") and hour == 12:
        hour = 0
    elif not marker.startswith(("a", "p")):
        if (words & (AFTERNOON_WORDS | EVENING_WORDS | NIGHT_WORDS)) and hour < 12:
            hour += 12
        elif words & MORNING_WORDS and hour == 12:
            hour = 0
        elif hour < ASSUMED_BUSINESS_START and hour + 12 <= ASSUMED_BUSINESS_END:
            # "at 2" during business hours means 2 PM, not 2 AM.
            hour += 12

    return time(hour=min(hour, 23), minute=minute)


def parse_datetime(
    text: str,
    timezone: str = "Asia/Kolkata",
    now: datetime | None = None,
) -> ParsedDateTime | None:
    """Parse a spoken date/time. Returns None when nothing is recognisable."""
    try:
        zone = ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        # Falling back to UTC keeps parsing working; the caller's timezone is
        # misconfigured rather than the expression being unparseable.
        zone = UTC

    reference = (now or datetime.now(UTC)).astimezone(zone)

    date_result = _resolve_date(text, reference.date())
    if date_result.invalid:
        return None

    resolved_date = date_result.value
    had_date = date_result.had_date
    resolved_time, had_time = _resolve_time(date_result.remainder or text)

    if not had_date and not had_time:
        return None

    if resolved_date is None:
        resolved_date = reference.date()

    if resolved_time is None:
        # A date with no time is incomplete; the AI must ask for the hour.
        local = datetime.combine(resolved_date, time(0, 0), tzinfo=zone)
        return ParsedDateTime(
            at=local.astimezone(UTC), had_date=had_date, had_time=False, text=text
        )

    local = datetime.combine(resolved_date, resolved_time, tzinfo=zone)

    # A time already past today, stated without a date, means tomorrow.
    if not had_date and local <= reference:
        local += timedelta(days=1)

    return ParsedDateTime(at=local.astimezone(UTC), had_date=had_date, had_time=True, text=text)
