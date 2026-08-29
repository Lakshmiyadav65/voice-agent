"""Object storage behind a swappable interface.

Local disk is the development implementation. An S3-compatible provider slots in
for production without touching the ingestion pipeline.
"""

import uuid
from abc import ABC, abstractmethod
from pathlib import Path


class StorageProvider(ABC):
    @abstractmethod
    async def save(self, business_id: uuid.UUID, filename: str, data: bytes) -> str:
        """Persist bytes and return an opaque storage path."""

    @abstractmethod
    async def load(self, storage_path: str) -> bytes: ...

    @abstractmethod
    async def delete(self, storage_path: str) -> None: ...


def _safe_filename(filename: str) -> str:
    """Strip any directory components a client may have supplied."""
    return Path(filename).name or "upload"


class LocalFileStorage(StorageProvider):
    def __init__(self, root: Path | str) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, storage_path: str) -> Path:
        candidate = (self.root / storage_path).resolve()
        if not candidate.is_relative_to(self.root.resolve()):
            raise ValueError("Storage path escapes the storage root")
        return candidate

    async def save(self, business_id: uuid.UUID, filename: str, data: bytes) -> str:
        # Tenant prefix keeps one business's files out of another's namespace.
        relative = f"{business_id}/{uuid.uuid4()}-{_safe_filename(filename)}"
        destination = self._resolve(relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        return relative

    async def load(self, storage_path: str) -> bytes:
        return self._resolve(storage_path).read_bytes()

    async def delete(self, storage_path: str) -> None:
        target = self._resolve(storage_path)
        target.unlink(missing_ok=True)


class InMemoryStorage(StorageProvider):
    """Used by tests so uploads leave nothing on disk."""

    def __init__(self) -> None:
        self._files: dict[str, bytes] = {}

    async def save(self, business_id: uuid.UUID, filename: str, data: bytes) -> str:
        path = f"{business_id}/{uuid.uuid4()}-{_safe_filename(filename)}"
        self._files[path] = data
        return path

    async def load(self, storage_path: str) -> bytes:
        if storage_path not in self._files:
            raise FileNotFoundError(storage_path)
        return self._files[storage_path]

    async def delete(self, storage_path: str) -> None:
        self._files.pop(storage_path, None)
