"""Extract plain text from uploaded business documents.

Parsers never invent content. A file that cannot be read raises
`UnsupportedDocumentError` so the document is marked failed rather than ingested
as an empty or partial knowledge source.
"""

import csv
import io
from pathlib import Path

TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".text"}
CSV_EXTENSIONS = {".csv", ".tsv"}
PDF_EXTENSIONS = {".pdf"}

SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | CSV_EXTENSIONS | PDF_EXTENSIONS


class UnsupportedDocumentError(Exception):
    pass


class EmptyDocumentError(Exception):
    pass


def _decode(data: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise UnsupportedDocumentError("File is not readable as text")


def _parse_text(data: bytes) -> str:
    return _decode(data)


def _parse_csv(data: bytes, delimiter: str) -> str:
    """Flatten rows to `column: value` lines so each row reads as a sentence."""
    text = _decode(data)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    lines = []
    for row in reader:
        parts = [f"{key}: {value}" for key, value in row.items() if key and value]
        if parts:
            lines.append(". ".join(parts))

    if not lines:
        # Not a keyed table; fall back to the raw text rather than dropping it.
        return text

    return "\n".join(lines)


def _parse_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:
        raise UnsupportedDocumentError("PDF could not be opened") from exc

    pages = []
    for page in reader.pages:
        extracted = page.extract_text() or ""
        if extracted.strip():
            pages.append(extracted)

    if not pages:
        raise EmptyDocumentError("No selectable text found in the PDF; it may be a scanned image")

    return "\n\n".join(pages)


def parse_document(filename: str, data: bytes) -> str:
    extension = Path(filename).suffix.lower()

    if extension in TEXT_EXTENSIONS:
        text = _parse_text(data)
    elif extension in CSV_EXTENSIONS:
        text = _parse_csv(data, delimiter="\t" if extension == ".tsv" else ",")
    elif extension in PDF_EXTENSIONS:
        text = _parse_pdf(data)
    else:
        raise UnsupportedDocumentError(
            f"Unsupported file type '{extension or filename}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    if not text.strip():
        raise EmptyDocumentError("Document contains no readable text")

    return text
