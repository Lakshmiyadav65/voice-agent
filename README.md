# AI Employee Platform

A managed AI Employee platform for Indian businesses. AI employees conduct natural voice conversations, access business-specific data through the **Business Brain**, send WhatsApp messages, book appointments, and escalate to humans.

## Architecture

| Layer | Stack |
|-------|-------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI |
| Database | PostgreSQL + pgvector |
| Cache/Queue | Redis |
| Object Storage | S3-compatible (Phase 4) |

## Repository Structure

```
├── backend/          # FastAPI API server
│   ├── alembic/      # Database migrations
│   ├── app/
│   │   ├── api/      # REST API routes + auth/tenant dependencies
│   │   ├── core/     # Database, config, security
│   │   ├── models/   # SQLAlchemy models
│   │   ├── schemas/  # Pydantic schemas
│   │   ├── scripts/  # Seed and maintenance scripts
│   │   ├── services/ # Business logic
│   │   └── providers/# Modular STT/LLM/TTS/Telephony/WhatsApp interfaces
│   └── tests/
├── frontend/         # Next.js web app
│   └── src/
├── docs/             # Product & technical documentation
├── docker-compose.yml
└── .env.example
```

## Prerequisites

- Node.js 20+
- Python 3.12+
- Docker & Docker Compose

## Quick Start

### 1. Clone and configure

```bash
cp .env.example .env
```

### 2. Start infrastructure

```bash
docker compose up -d
```

### 3. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt

# Apply migrations and load demo data
alembic upgrade head
python -m app.scripts.seed

uvicorn app.main:app --reload --port 8000
```

Backend health check: http://localhost:8000/health
Interactive API docs: http://localhost:8000/docs

### Seeded accounts

| Role | Email | Password |
|------|-------|----------|
| Platform admin | `admin@platform.in` | `AdminPass123` |
| AI trainer | `trainer@platform.in` | `TrainerPass123` |
| Business owner | `ravi@srimobile.in` | `OwnerPass123` |

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:3000

## Development Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | Complete | Project setup |
| 2 | Complete | Database & authentication |
| 3 | Complete | Business Brain — structured data |
| 4 | Complete | Business Brain — knowledge base |
| 5 | Complete | AI conversation engine |
| 6 | Complete | AI router & tool calling |
| 7 | Partial | Voice / telephony — needs a provider |
| 8 | Pending | WhatsApp |
| 9 | Pending | Dynamic business updates |
| 10 | Pending | AI Trainer Console |
| 11 | Pending | AI evaluation |
| 12 | Pending | Business Owner Dashboard |
| 13 | Pending | Continuous improvement |
| 14 | Pending | Pilot |
| 15 | Pending | Production hardening |

See `docs/06_IMPLEMENTATION_PLAN.md` for full details.

## Access Control

Two independent role layers govern every request.

**Platform role** (`users.role`) separates internal staff from customers:

| Role | Capability |
|------|------------|
| `platform_admin` | Full platform access |
| `ai_trainer` | Access every business; author and deploy AI versions |
| `business_user` | Access only businesses they are a member of |

**Business membership role** (`business_members.role`) scopes a user within one tenant:

| Role | Capability |
|------|------------|
| `owner` | Read and write business information; manage members |
| `manager` | Read and write business information; manage members |
| `staff` | Read-only |

Tenant isolation is enforced by a single dependency that resolves the business from the
URL path and verifies membership. Requests for a business the user cannot access return
`404` rather than `403`, so tenant existence is never leaked. AI configuration and version
deployment require an internal role, keeping technical AI settings out of the business-owner
surface as the product brief requires.

## Business Brain — Structured Data

Business facts live in the database, never in prompts or model weights. The AI reads them
through deterministic lookups so that changing a price is an ordinary data edit rather than
a retraining event.

### Effective-date price resolution

Prices are append-only rows with an effective window. The active price is the row with the
latest `effective_from` that has already started and has not been closed out:

```sql
SELECT * FROM product_prices
WHERE product_variant_id = :variant
  AND effective_from <= :now
  AND (effective_to IS NULL OR effective_to > :now)
ORDER BY effective_from DESC
LIMIT 1
```

Scheduling a change is therefore just inserting a future-dated row. Nothing runs at the
boundary — the same query simply starts returning a different row the moment it becomes
effective. This satisfies the Phase 3 critical test: Rs 15,000 before 2:00 PM, Rs 17,000
after, with no write and no retraining in between.

### The no-fabrication guarantee

`find_product` matches on exact (case-insensitive) name within one business. It is
deliberately not a fuzzy search, so `iPhone` will not resolve to `iPhone 15`. A miss returns
`found=false` with no product payload at all, and any near matches appear separately as
`suggestions` — alternatives a human can offer, never an answer to the question asked.

The same rule applies below the product level: a variant with no price row reports
`price.found=false` rather than borrowing a sibling's price, and a variant with no inventory
row reports `stock.found=false`, which is distinct from a known quantity of zero.

### AI-facing lookup

```
GET /api/v1/businesses/{business_id}/lookup/product?name=iPhone%2015&variant=128GB&at=<iso8601>
```

The optional `at` parameter resolves prices and offers as of any moment, which is how the
scheduled-change behaviour is tested and audited.

## Business Brain — Knowledge Base

Unstructured business knowledge (policies, brochures, FAQs, documents) runs through a
fixed pipeline:

```
Upload -> Parse -> Chunk -> Embed -> Store -> Retrieve -> Context -> LLM
```

Supported formats are `.txt`, `.md`, `.csv`, `.tsv`, and `.pdf`. Knowledge can also be
added as plain text without a file.

### Retrieval always cites its source

Every hit carries the document name, document ID, chunk index, similarity score, and the
character offsets within the original. Nothing can be stated from the knowledge base
without being traceable to the passage it came from.

```
POST /api/v1/businesses/{business_id}/knowledge/search
{ "query": "What is the return policy?", "top_k": 5, "min_score": 0.1 }
```

Passages below the score threshold are discarded, so an unrelated question returns no
hits rather than the least-bad match. An empty result is a meaningful answer: the
business has stored nothing that addresses the question.

### Failed ingestion is visible, never silent

A file that cannot be parsed is stored with `status=failed` and the reason recorded on
the document. It contributes no chunks, so a broken upload can never masquerade as
knowledge the AI has.

### Swappable providers

Storage and embeddings sit behind interfaces, matching the TRD's modularity requirement:

| Interface | Development | Production |
|-----------|-------------|------------|
| `StorageProvider` | Local filesystem | S3-compatible |
| `EmbeddingProvider` | `HashingEmbeddingProvider` | Hosted embedding model |

`HashingEmbeddingProvider` is a deterministic bag-of-words vectorizer. It makes the
pipeline runnable and testable with no network access, but it carries no semantic
knowledge and must be replaced before production. Swapping providers requires re-embedding,
which is what `POST /knowledge/documents/{id}/reembed` is for.

### Vector storage

Embeddings are stored in a `pgvector` column with an IVFFlat cosine index. Retrieval uses
the pgvector distance operator on PostgreSQL and falls back to an in-Python cosine
computation on other dialects, so the test suite runs without the extension.

## AI Conversation Engine

Each turn runs a fixed sequence:

```
transcribe -> detect language -> retrieve business data -> build context
-> generate -> guardrail -> update state -> synthesize
```

Retrieval happens *before* generation, so the model is handed the facts rather than asked
to recall them. The guardrail runs *after* generation, so nothing the model invents can
reach the caller.

### Guardrails

The engine treats model output as untrusted. Before a reply is spoken it is scanned for
concrete claims, and every one must appear in the grounding set assembled from that turn's
retrieval:

| Claim | Grounded by |
|-------|-------------|
| A price | A `product_prices` row resolved for the requested variant, or a figure quoted in a retrieved passage |
| A stock figure | An `inventory` row for the variant |
| A policy statement | At least one retrieved knowledge passage |

A reply containing anything else is blocked and replaced with an honest fallback, and the
call escalates. The fallback deliberately does **not** substitute the correct value — the
system cannot know what the model meant to say, so it says it does not have the
information confirmed.

Product and price questions are answered from structured data only. A weakly related
policy passage is never allowed to stand in for a catalogue lookup that found nothing.

### Language handling

Telugu is detected by Unicode range. Tanglish — Telugu written in Latin script — has no
script signal, so it is detected by a marker vocabulary of romanized Telugu *function*
words (`entha`, `undha`, `kavali`, `lo`, `meeru`). Function words are used rather than
nouns because they survive code-switching: a caller swaps in English product names but
keeps Telugu grammar.

The reply mirrors the caller's current utterance. When an utterance carries no signal
(a bare number, for instance), the conversation's established language is kept so the AI
does not switch language mid-call over a one-word answer.

### Escalation

| Trigger | Reason |
|---------|--------|
| Caller asks for a person | `customer_request` |
| Reply failed the guardrail | `ungrounded_answer` |
| Three consecutive dead ends | `repeated_failure` |
| STT, LLM, or TTS outage | `provider_failure` |

A provider outage is reported as a problem, never dressed up as a normal answer.

### Conversation state

Sessions track turn history, the settled language, and slots gathered so far
(product interest, budget, location, requirement), so a caller never repeats themselves.
Barge-in is recorded on the interrupted turn.

```
POST   /api/v1/businesses/{id}/conversations
POST   /api/v1/businesses/{id}/conversations/{cid}/turns
POST   /api/v1/businesses/{id}/conversations/{cid}/interrupt
POST   /api/v1/businesses/{id}/conversations/{cid}/end
```

Each turn response returns the grounding set and any violations, which is what the
Phase 10 Test Lab and conversation review screens read.

### Provider status

| Interface | Current | Production |
|-----------|---------|------------|
| `LLMProvider` | `ContextOnlyLLMProvider` | Hosted model |
| `STTProvider` | `EchoSTTProvider` | Hosted recogniser |
| `TTSProvider` | `SilentTTSProvider` | Hosted voice |

No vendor is configured yet. The offline providers make the engine runnable and testable
end to end; `ContextOnlyLLMProvider` answers only from supplied context, so a guardrail
violation in tests means the pipeline supplied bad context rather than that a model
hallucinated. Swapping in a hosted model requires no change to conversation logic.

## AI Router and Tools

Routing is **rule-based and deterministic, not model-driven**. Where a fact comes from is a
correctness property, so it is decided by code that can be read and tested rather than
inferred by a model on each call. The router implements the TRD's source-selection table:

| Question | Source | Tool |
|----------|--------|------|
| Price, cost, rate | Structured data | `find_product` |
| Stock, availability | Inventory | `check_inventory` |
| Policy, warranty, delivery, FAQ | Knowledge base | `search_knowledge` |
| Appointment, booking, visit | Calendar | `check_availability`, `book_appointment` |
| "send it on WhatsApp" | WhatsApp | `send_whatsapp`, `send_brochure`, `send_location` |
| Caller's own details | CRM | `create_lead`, `update_crm` |
| "let me speak to someone" | Human | `transfer_to_human` |
| Anything else | None | — |

Rules are ordered, so precedence is explicit: a request for a human overrides everything;
availability beats price when both appear; and policy vocabulary is checked *after* product
intents so "iPhone 15 price" is never pulled into the knowledge base.

An unroutable question returns no source at all rather than being forced into the
nearest one.

### Tool execution

Every tool validates its arguments before running, returns a typed status instead of
raising into the call, and is logged with its arguments and duration. Results carry data
only on success, so a failed lookup cannot become an invented answer.

| Status | Meaning |
|--------|---------|
| `success` | Completed; `data` is populated |
| `not_found` | Ran correctly, the business has no such record |
| `invalid_input` | Arguments were missing or unusable |
| `unavailable` | A provider or slot could not serve the request |
| `failed` | Unexpected error, contained so the call continues |

Write and send tools only run once their required arguments are genuinely available. An
appointment is never booked from a half-heard request, and with no WhatsApp provider
connected a send returns `unavailable` — never a false confirmation of delivery, which the
App Flow explicitly forbids.

### Spoken date and time

Callers say "tomorrow at 11 AM" or "repu 11 gantalaki", so appointment requests run through
a parser covering relative days, weekday names, numeric dates, and Telugu time markers,
resolved in the business timezone. It is deliberately conservative: a vague expression
("sometime soon") or an impossible date returns nothing, so the AI asks instead of booking
the wrong slot. A bare number in a price sentence is not read as a clock time.

### Inspecting routing

Every turn response reports the intent, the chosen source, the reason, and the full tool
call log. Routing can also be previewed without running a turn:

```
POST /api/v1/businesses/{business_id}/conversations/route
{ "text": "Is the Pixel 9 in stock?" }
```

## Voice and Telephony

A call runs from ring to summary through `CallService`:

```
webhook -> start call -> greet -> [ audio -> STT -> turn -> TTS -> audio ]* -> hangup -> summary
```

### Transcripts are written as the call happens

Each utterance is persisted immediately with its sequence number, language, chosen source,
tool calls, and guardrail verdict — not assembled at the end. A call that drops mid-way
still leaves a complete, reviewable record.

### Summaries are assembled, not generated

`build_summary` composes the summary from stored facts: duration, turn count, sources used,
successful actions, blocked replies, escalation reason, outcome. Because it is assembled
rather than written by a model, a summary can never assert something the call did not
contain.

### Recording only where permitted

`recording_consent` and `recording_path` live on the same row and are always checked
together. A recording URL arriving from the vendor is discarded unless consent was granted,
and withdrawing consent clears the stored path.

### Webhooks

```
POST /api/v1/telephony/{business_id}/incoming
POST /api/v1/telephony/{business_id}/status
```

Both accept JSON or form-encoded payloads, since vendors differ, and normalise fields
through the provider so vendor-specific names stay in one place. Incoming webhooks are
idempotent: vendors retry, and a retry must not start a second call.

### Audio streaming

```
WS /api/v1/businesses/{business_id}/calls/{call_id}/stream
```

Binary frames are caller audio; text frames are control messages. Replies stream back as
JSON plus synthesised audio. The call is ended on every exit path — clean hangup,
escalation, or dropped connection — so a transcript and summary always survive.

### Failure handling

| Failure | Behaviour |
|---------|-----------|
| Recogniser fails | Ask the caller to repeat; escalate after three attempts |
| Model fails | Say so honestly and transfer |
| Outbound dial fails | Record the attempt as a failed call with the error |
| Reply fails the guardrail | Block, flag in the transcript, escalate |

The vendor's reported call duration is treated as authoritative, since it measured the
actual connected time.

### Provider status

No telephony vendor is configured. `UnconfiguredTelephonyProvider` still parses inbound
webhooks correctly but refuses outbound calls rather than appearing to place them.
`MockTelephonyProvider` backs the tests.

**This phase is not complete.** Its criterion is "a real phone call completes the core flow
end-to-end", which cannot be met until a telephony vendor plus real STT and TTS are
connected. Everything around them — call records, transcripts, summaries, consent,
webhooks, the streaming loop, and failure handling — is built and tested.

## Schema Notes

The following columns were added to `users` beyond `docs/05_BACKEND_SCHEMA.md`, because
authentication cannot be implemented without them:

- `password_hash` — bcrypt hash; never returned by any endpoint
- `is_active` — allows disabling an account without deleting audit history

`knowledge_documents` and `knowledge_chunks` add operational columns the pipeline needs:

- `content_type`, `error`, `chunk_count` on documents — surface ingestion failures to the trainer
- `chunk_index` on chunks — preserves document order for citation
- `business_id` on chunks — denormalised so vector search filters by tenant without a join

The schema document names the metadata columns `metadata`; they are `doc_metadata` and
`chunk_metadata` in code because `metadata` is reserved by SQLAlchemy's declarative base.

No other deviations from the documented schema.

## Documentation

- [PRD](docs/01_PRD.md) — Product requirements
- [TRD](docs/02_TRD.md) — Technical requirements
- [App Flow](docs/03_APP_FLOW.md) — User journeys
- [UI/UX Brief](docs/04_UI_UX_DESIGN_BRIEF.md) — Design direction
- [Backend Schema](docs/05_BACKEND_SCHEMA.md) — Database schema
- [Implementation Plan](docs/06_IMPLEMENTATION_PLAN.md) — Phased build plan

## Core Principle

> The model learns how to converse. The Business Brain knows what is true about the business.
