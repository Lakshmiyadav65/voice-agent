"""Language identification for English, Telugu, and Tanglish.

Telugu script is detected by Unicode range. Tanglish -- Telugu written in Latin
script, usually mixed with English -- has no script signal, so it is detected by
a marker vocabulary of common romanized Telugu function words. Function words
are used rather than nouns because they survive code-switching: a customer may
swap in English product names but keeps Telugu grammar.
"""

import re
from dataclasses import dataclass

from app.models.enums import Language

# Telugu Unicode block.
TELUGU_PATTERN = re.compile(r"[\u0C00-\u0C7F]")
LATIN_WORD = re.compile(r"[a-zA-Z]+")

# Romanized Telugu function words, question words, and verb endings.
TANGLISH_MARKERS = frozenset(
    {
        # question and demonstrative words
        "entha",
        "enta",
        "enti",
        "emi",
        "ela",
        "ekkada",
        "eppudu",
        "evaru",
        "enduku",
        "edi",
        "ee",
        "aa",
        # verbs and verb endings
        "undha",
        "unda",
        "undi",
        "unnaya",
        "unnayi",
        "unnaru",
        "ledu",
        "kavali",
        "cheppandi",
        "cheppu",
        "chudandi",
        "ivvandi",
        "pampandi",
        "pampinchandi",
        "chesaru",
        "chestaru",
        "vasthundi",
        "isthara",
        "cheyandi",
        "teliyadu",
        "telusa",
        "kaavali",
        # pronouns and particles
        "meeru",
        "meru",
        "nenu",
        "naku",
        "nak",
        "miku",
        "mee",
        "vaadu",
        "adi",
        "idi",
        "lo",
        "lopala",
        "ki",
        "ku",
        "tho",
        "kosam",
        "gurinchi",
        "kuda",
        "matram",
        "kani",
        "ante",
        "appudu",
        # common adverbs and adjectives
        "chala",
        "chaala",
        "baga",
        "bagundi",
        "thakkuva",
        "ekkuva",
        "konchem",
        "inka",
        "sarigga",
        "correct",
        "sare",
        "avunu",
        "kadu",
        # courtesy
        "dhanyavadalu",
        "namaskaram",
        "andi",
        "garu",
    }
)

# Short markers that are also English words or fragments; require corroboration.
AMBIGUOUS_MARKERS = frozenset({"lo", "ki", "ku", "aa", "ee", "adi", "idi", "andi", "correct"})

STRONG_MARKERS = TANGLISH_MARKERS - AMBIGUOUS_MARKERS


@dataclass
class LanguageResult:
    language: Language
    confidence: float
    code_switched: bool = False
    telugu_script_ratio: float = 0.0
    tanglish_markers: tuple[str, ...] = ()

    @property
    def is_telugu_family(self) -> bool:
        return self.language in (Language.TELUGU, Language.TANGLISH)


def _telugu_ratio(text: str) -> float:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return 0.0
    telugu = sum(1 for ch in letters if TELUGU_PATTERN.match(ch))
    return telugu / len(letters)


def detect_language(text: str) -> LanguageResult:
    """Classify a customer utterance.

    Mixed input is normal on these calls; `code_switched` records that both
    languages were present so the reply can mirror the customer's register.
    """
    stripped = text.strip()
    if not stripped:
        return LanguageResult(language=Language.UNKNOWN, confidence=0.0)

    ratio = _telugu_ratio(stripped)
    words = [word.lower() for word in LATIN_WORD.findall(stripped)]
    found_strong = tuple(word for word in words if word in STRONG_MARKERS)
    found_any = tuple(word for word in words if word in TANGLISH_MARKERS)

    has_latin = bool(words)

    if ratio > 0.0:
        # Telugu script present. Latin words alongside it means code-switching.
        code_switched = has_latin
        confidence = min(1.0, 0.6 + ratio * 0.4)
        return LanguageResult(
            language=Language.TELUGU,
            confidence=confidence,
            code_switched=code_switched,
            telugu_script_ratio=ratio,
            tanglish_markers=found_any,
        )

    if not has_latin:
        return LanguageResult(language=Language.UNKNOWN, confidence=0.0)

    # A single strong marker is enough; Telugu grammar words rarely appear in
    # English sentences by accident.
    if found_strong:
        marker_density = len(found_any) / len(words)
        confidence = min(1.0, 0.55 + marker_density)
        english_words = len(words) - len(found_any)
        return LanguageResult(
            language=Language.TANGLISH,
            confidence=confidence,
            code_switched=english_words > 0,
            tanglish_markers=found_any,
        )

    return LanguageResult(
        language=Language.ENGLISH,
        confidence=0.9 if len(words) > 1 else 0.6,
        tanglish_markers=found_any,
    )


def choose_reply_language(
    detected: LanguageResult,
    previous: Language | None = None,
) -> Language:
    """Pick the language to answer in.

    The customer's current utterance wins. When it carries no signal, the
    conversation's established language is kept so the AI does not switch
    language mid-call over a one-word reply.
    """
    if detected.language is Language.UNKNOWN:
        return previous or Language.ENGLISH

    if detected.language is Language.TELUGU and detected.code_switched:
        # Script Telugu mixed with English reads naturally answered in Tanglish.
        return Language.TANGLISH

    return detected.language
