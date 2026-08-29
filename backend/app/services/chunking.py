"""Split documents into retrievable passages.

Chunks break on paragraph boundaries where possible so a retrieved passage reads
as a coherent statement rather than a fragment cut mid-sentence. Consecutive
chunks overlap so a fact spanning a boundary is still fully present in one of
them.
"""

import re
from dataclasses import dataclass

DEFAULT_CHUNK_SIZE = 900
DEFAULT_OVERLAP = 150

PARAGRAPH_BREAK = re.compile(r"\n\s*\n")
WHITESPACE = re.compile(r"[ \t]+")


@dataclass
class Chunk:
    index: int
    content: str
    char_start: int
    char_end: int


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return WHITESPACE.sub(" ", text).strip()


def _split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in PARAGRAPH_BREAK.split(text) if p.strip()]


def _split_oversized(paragraph: str, chunk_size: int, overlap: int) -> list[str]:
    """Window a paragraph that exceeds the chunk size on its own."""
    pieces = []
    step = max(chunk_size - overlap, 1)
    for start in range(0, len(paragraph), step):
        piece = paragraph[start : start + chunk_size].strip()
        if piece:
            pieces.append(piece)
        if start + chunk_size >= len(paragraph):
            break
    return pieces


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[Chunk]:
    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    normalized = _normalize(text)
    if not normalized:
        return []

    paragraphs = _split_paragraphs(normalized) or [normalized]

    blocks: list[str] = []
    buffer = ""

    for paragraph in paragraphs:
        if len(paragraph) > chunk_size:
            if buffer:
                blocks.append(buffer)
                buffer = ""
            blocks.extend(_split_oversized(paragraph, chunk_size, overlap))
            continue

        candidate = f"{buffer}\n\n{paragraph}" if buffer else paragraph
        if len(candidate) <= chunk_size:
            buffer = candidate
        else:
            blocks.append(buffer)
            buffer = paragraph

    if buffer:
        blocks.append(buffer)

    chunks = []
    cursor = 0
    for index, block in enumerate(blocks):
        found = normalized.find(block[:80], cursor) if block else -1
        char_start = found if found >= 0 else cursor
        chunks.append(
            Chunk(
                index=index,
                content=block,
                char_start=char_start,
                char_end=char_start + len(block),
            )
        )
        cursor = max(char_start + len(block) - overlap, 0)

    return chunks
