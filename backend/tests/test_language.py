"""Language identification across English, Telugu, Tanglish, and mixed speech."""

import pytest

from app.models.enums import Language
from app.services.language import choose_reply_language, detect_language


@pytest.mark.parametrize(
    "text",
    [
        "What is the price of the iPhone 15?",
        "Do you have it in stock?",
        "I would like to book an appointment tomorrow at eleven.",
    ],
)
def test_plain_english_is_detected(text):
    assert detect_language(text).language is Language.ENGLISH


@pytest.mark.parametrize(
    "text",
    [
        "ఐఫోన్ ధర ఎంత?",
        "స్టాక్ లో ఉందా?",
        "నమస్కారం",
    ],
)
def test_telugu_script_is_detected(text):
    result = detect_language(text)

    assert result.language is Language.TELUGU
    assert result.telugu_script_ratio > 0.5


@pytest.mark.parametrize(
    "text",
    [
        "iPhone 15 price entha?",
        "Pixel 9 stock lo undha?",
        "WhatsApp lo details pampinchandi",
        "Naku oka mobile kavali",
        "Meeru eppudu open chestaru?",
    ],
)
def test_tanglish_is_detected(text):
    result = detect_language(text)

    assert result.language is Language.TANGLISH
    assert result.tanglish_markers


def test_tanglish_with_english_is_marked_code_switched():
    result = detect_language("iPhone 15 price entha andi?")

    assert result.language is Language.TANGLISH
    assert result.code_switched is True


def test_telugu_script_mixed_with_english_is_code_switched():
    result = detect_language("iPhone 15 ధర ఎంత?")

    assert result.language is Language.TELUGU
    assert result.code_switched is True


def test_english_is_not_misread_as_tanglish():
    """English sentences must not trip the marker vocabulary."""
    for text in [
        "Please send the location to me",
        "The store is open until nine",
        "Can I get a discount on this model?",
    ]:
        assert detect_language(text).language is Language.ENGLISH


def test_empty_input_is_unknown():
    assert detect_language("   ").language is Language.UNKNOWN
    assert detect_language("").confidence == 0.0


def test_digits_only_is_unknown():
    assert detect_language("15000").language is Language.UNKNOWN


def test_reply_language_mirrors_the_customer():
    tanglish = detect_language("price entha?")
    english = detect_language("what is the price?")

    assert choose_reply_language(tanglish) is Language.TANGLISH
    assert choose_reply_language(english) is Language.ENGLISH


def test_reply_to_mixed_script_telugu_is_tanglish():
    """Script Telugu peppered with English reads naturally as Tanglish."""
    mixed = detect_language("iPhone 15 ధర ఎంత?")

    assert choose_reply_language(mixed) is Language.TANGLISH


def test_unclear_input_keeps_the_established_language():
    unclear = detect_language("15000")

    assert choose_reply_language(unclear, previous=Language.TANGLISH) is Language.TANGLISH
    assert choose_reply_language(unclear) is Language.ENGLISH


def test_telugu_family_helper():
    assert detect_language("price entha?").is_telugu_family
    assert detect_language("ధర ఎంత?").is_telugu_family
    assert not detect_language("what is the price?").is_telugu_family
