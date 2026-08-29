"""Unit coverage for the parse and chunk stages of the ingestion pipeline."""

import pytest

from app.providers.embeddings import HashingEmbeddingProvider, cosine_similarity
from app.services.chunking import chunk_text
from app.services.parsing import (
    EmptyDocumentError,
    UnsupportedDocumentError,
    parse_document,
)


def test_paragraphs_are_kept_whole_when_they_fit():
    text = "First paragraph about delivery.\n\nSecond paragraph about warranty."

    chunks = chunk_text(text, chunk_size=200, overlap=20)

    assert len(chunks) == 1
    assert "delivery" in chunks[0].content
    assert "warranty" in chunks[0].content


def test_long_text_is_split_into_multiple_chunks():
    paragraphs = [f"Paragraph number {i} with some supporting detail." for i in range(40)]

    chunks = chunk_text("\n\n".join(paragraphs), chunk_size=200, overlap=40)

    assert len(chunks) > 1
    assert all(len(chunk.content) <= 200 for chunk in chunks)


def test_a_single_oversized_paragraph_is_windowed():
    text = "word " * 600

    chunks = chunk_text(text, chunk_size=300, overlap=50)

    assert len(chunks) > 1
    assert all(len(chunk.content) <= 300 for chunk in chunks)


def test_chunk_indexes_are_contiguous():
    text = "\n\n".join(f"Section {i}. " + "detail " * 40 for i in range(10))

    chunks = chunk_text(text, chunk_size=250, overlap=50)

    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))


def test_empty_text_produces_no_chunks():
    assert chunk_text("   \n\n  ") == []


def test_overlap_must_be_smaller_than_chunk_size():
    with pytest.raises(ValueError):
        chunk_text("some text", chunk_size=100, overlap=100)


def test_markdown_and_text_are_parsed():
    assert "Hello" in parse_document("notes.md", b"# Hello\n\nWorld")
    assert "Hello" in parse_document("notes.txt", b"Hello")


def test_csv_becomes_labelled_sentences():
    data = b"model,price\niPhone 15,15000\n"

    parsed = parse_document("catalogue.csv", data)

    assert "model: iPhone 15" in parsed
    assert "price: 15000" in parsed


def test_tsv_uses_tab_delimiter():
    data = b"model\tprice\nPixel 9\t20000\n"

    parsed = parse_document("catalogue.tsv", data)

    assert "model: Pixel 9" in parsed


def test_unsupported_extension_raises():
    with pytest.raises(UnsupportedDocumentError):
        parse_document("photo.png", b"\x89PNG")


def test_whitespace_only_document_raises():
    with pytest.raises(EmptyDocumentError):
        parse_document("blank.txt", b"   \n\n   ")


@pytest.mark.asyncio
async def test_embeddings_are_deterministic():
    provider = HashingEmbeddingProvider(dimensions=384)

    first = await provider.embed_one("return policy within 7 days")
    second = await provider.embed_one("return policy within 7 days")

    assert first == second
    assert len(first) == 384


@pytest.mark.asyncio
async def test_related_text_scores_higher_than_unrelated():
    provider = HashingEmbeddingProvider(dimensions=384)

    query = await provider.embed_one("warranty covers hardware defects")
    related = await provider.embed_one("the warranty covers hardware defects only")
    unrelated = await provider.embed_one("home delivery timings within city limits")

    assert cosine_similarity(query, related) > cosine_similarity(query, unrelated)


@pytest.mark.asyncio
async def test_embedding_is_normalized():
    provider = HashingEmbeddingProvider(dimensions=384)

    vector = await provider.embed_one("some business knowledge")
    magnitude = sum(value * value for value in vector) ** 0.5

    assert magnitude == pytest.approx(1.0, abs=1e-9)


@pytest.mark.asyncio
async def test_empty_text_embeds_to_a_zero_vector():
    provider = HashingEmbeddingProvider(dimensions=384)

    vector = await provider.embed_one("")

    assert all(value == 0.0 for value in vector)
