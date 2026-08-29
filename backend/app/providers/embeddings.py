"""Embedding generation behind a swappable interface.

`HashingEmbeddingProvider` is a deterministic, dependency-free provider used for
development and tests. It is a real bag-of-words vector space -- similar text
produces similar vectors -- but it carries no semantic knowledge, so it must not
be used in production. A hosted model provider implements the same interface.
"""

import hashlib
import math
import re
from abc import ABC, abstractmethod

TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


class EmbeddingProvider(ABC):
    @property
    @abstractmethod
    def dimensions(self) -> int: ...

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...

    async def embed_one(self, text: str) -> list[float]:
        vectors = await self.embed([text])
        return vectors[0]


def _tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())


class HashingEmbeddingProvider(EmbeddingProvider):
    """Hashing vectorizer with sublinear term weighting and L2 normalization.

    Deterministic across runs and processes, which keeps retrieval tests stable
    and lets the pipeline be exercised with no network access.
    """

    def __init__(self, dimensions: int = 384) -> None:
        self._dimensions = dimensions

    @property
    def dimensions(self) -> int:
        return self._dimensions

    @property
    def name(self) -> str:
        return f"hashing-{self._dimensions}"

    def _bucket(self, token: str) -> int:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        return int.from_bytes(digest, "big") % self._dimensions

    def _vector(self, text: str) -> list[float]:
        counts: dict[int, float] = {}
        for token in _tokenize(text):
            counts[self._bucket(token)] = counts.get(self._bucket(token), 0.0) + 1.0

        vector = [0.0] * self._dimensions
        for bucket, count in counts.items():
            # Damp repeated terms so long passages do not dominate.
            vector[bucket] = 1.0 + math.log(count)

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0.0:
            return vector
        return [value / norm for value in vector]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=False))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (left_norm * right_norm)
