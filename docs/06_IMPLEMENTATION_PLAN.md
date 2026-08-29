# AI Employee Platform --- Implementation Plan

## Development Principle

Build in dependency order. Each phase has a goal and completion
criteria. Do not let an AI coding agent freelance architecture or skip
foundational work.

# Phase 1 --- Project Setup

### Tasks

-   Git repository
-   Next.js frontend
-   FastAPI backend
-   PostgreSQL
-   Redis
-   Environment variables
-   Folder structure
-   CI checks
-   Development/staging environments

### Done

Frontend/backend/database run correctly and the repository structure is
documented.

# Phase 2 --- Database and Authentication

### Tasks

-   Users
-   Businesses
-   Members
-   Roles
-   AI employees
-   Tenant isolation
-   Migrations
-   Seed data

### Done

Authentication works, business membership works, and tenant isolation is
tested.

# Phase 3 --- Business Brain: Structured Data

### Tasks

-   Products
-   Variants
-   Prices
-   Inventory
-   Offers
-   FAQs
-   Rules
-   Exact product lookup
-   Effective-date price resolution

### Critical Test

Current price ₹15,000; scheduled price ₹17,000 at 2 PM. Before 2 PM the
AI lookup returns ₹15,000; after 2 PM it returns ₹17,000 without model
retraining.

### Done

Structured business data is accurate and dynamically updateable.

# Phase 4 --- Business Brain: Knowledge Base

### Tasks

-   File upload
-   Storage
-   Parsing
-   Chunking
-   Embeddings
-   pgvector
-   Retrieval
-   Source metadata

### Done

Uploaded business knowledge can be retrieved accurately.

# Phase 5 --- AI Conversation Engine

### Tasks

-   STT
-   LLM
-   TTS
-   Conversation state
-   Context
-   English
-   Telugu
-   Tanglish
-   Code-switching
-   Interruptions
-   Guardrails

### Done

AI conducts a complete test conversation naturally and maintains
context.

# Phase 6 --- AI Router and Tool Calling

### Tasks

Implement routing for: - Product lookup - Price - Inventory -
Knowledge - Calendar - WhatsApp - CRM - Human transfer

### Required Tests

-   iPhone price -\> product database
-   Return policy -\> knowledge base
-   Pixel availability -\> inventory
-   Tomorrow 11 AM -\> calendar
-   Send details on WhatsApp -\> WhatsApp tool

### Done

AI selects the correct source/action and does not fabricate missing
business information.

# Phase 7 --- Voice / Telephony

### Tasks

-   Telephony provider
-   Incoming/outgoing calls
-   Audio streaming
-   STT/TTS
-   Call state
-   Recording where permitted
-   Transcript
-   Summary
-   Error handling
-   Human transfer

### Done

A real phone call completes the core flow end-to-end.

# Phase 8 --- WhatsApp

### Tasks

-   WhatsApp Business integration
-   Message sending
-   Status
-   Templates where required
-   Customer/call linkage
-   Personalized information
-   Failure handling

### Done

A customer can request details during a call and receive them through
WhatsApp.

# Phase 9 --- Dynamic Business Updates

### Tasks

-   Edit price
-   Edit stock
-   Edit offers
-   Scheduled changes
-   Background worker
-   Audit logs
-   Effective-date resolution

### Done

Scheduled changes activate at the correct time and the AI immediately
uses the new information.

# Phase 10 --- AI Trainer Console

### Screens

-   Businesses
-   AI Employees
-   Business Brain
-   Knowledge
-   Training/configuration
-   Test Lab
-   Conversations
-   Knowledge Gaps
-   Analytics
-   Versions
-   Deployments

### Done

The trainer can configure, test, diagnose, improve, version, and deploy
an AI employee.

# Phase 11 --- AI Evaluation

### Dataset

Create tests covering: - Normal conversations - Telugu - Tanglish -
Product questions - Price - Availability - Comparisons - Objections -
WhatsApp - Appointments - Unknown questions - Hallucination -
Interruptions

### Metrics

-   Intent accuracy
-   Entity extraction
-   Business-data accuracy
-   Retrieval accuracy
-   Tool accuracy
-   Language accuracy
-   Hallucination rate
-   Latency

### Done

AI versions must pass defined thresholds before production.

# Phase 12 --- Business Owner Dashboard

### Screens

-   Dashboard
-   AI Employee
-   Calls
-   Leads
-   WhatsApp
-   Appointments
-   Business Information
-   Settings

### Actions

-   Update prices
-   Update stock
-   Update offers
-   Upload information
-   Schedule changes

### Done

A non-technical business user can manage approved business information
without configuring AI.

# Phase 13 --- Continuous Improvement

``` text
Live Calls -> Transcripts -> Evaluation
-> Failed Conversations -> AI Trainer
-> Diagnose -> Fix -> Retest -> New Version -> Deploy
```

### Done

Failed conversations can be reviewed and corrected without disrupting
the live version.

# Phase 14 --- Pilot

Start with 3--5 businesses, preferably one vertical such as real estate.

### Measure

-   Calls handled
-   Leads qualified
-   Answer accuracy
-   WhatsApp sends
-   Appointments
-   Human transfers
-   Conversion
-   Customer feedback

### Done

Real businesses complete the end-to-end workflow successfully.

# Phase 15 --- Production Hardening

### Tasks

-   Tenant isolation
-   Rate limiting
-   Monitoring
-   Logging
-   Alerting
-   Backup/recovery
-   Security review
-   Provider failure handling
-   Billing/usage architecture
-   Role permissions
-   Audit logs

### Done

Multiple businesses can operate safely with isolated data and monitored
infrastructure.

# First End-to-End MVP

``` text
Business
 -> Business Brain
 -> AI Employee
 -> Real Voice Call
 -> Customer Question
 -> Structured Data Lookup
 -> Correct Answer
 -> Customer requests details
 -> WhatsApp
 -> Customer receives details
```

# First Demonstration Scenario

Use a controlled mobile-store dataset: - iPhone 15, 128GB, ₹15,000,
stock 12. - Pixel 9, 128GB, ₹20,000, stock 5.

Test: 1. iPhone price. 2. Pixel price. 3. Compare them. 4. Pixel stock.
5. Send details on WhatsApp. 6. Schedule iPhone price to ₹17,000 at 2
PM. 7. Verify the new price after the effective time.

# AI Coding Agent Rules

1.  Read all six documents first.
2.  Treat them as the source of truth.
3.  Do not invent conflicting architecture.
4.  Do not change the schema silently.
5.  Implement one phase at a time.
6.  Do not skip dependencies.
7.  Add tests for core features.
8.  Keep technical AI configuration out of business-owner UI.
9.  Keep provider integrations modular.
10. Never hard-code business data into model prompts or application
    code.
11. Dynamic business data comes from the Business Brain.
12. Never fabricate unavailable business information.
13. Audit important data changes.
14. Keep production AI versions stable and deploy tested versions only.

# Final MVP Done Criteria

-   Business creation works.
-   AI employee configuration works.
-   Business data/documents can be added.
-   Product and price lookup works.
-   Scheduled changes work.
-   Knowledge retrieval works.
-   Real voice conversation works.
-   English/Telugu/Tanglish test scenarios work.
-   Correct source/tool is selected.
-   WhatsApp action works.
-   Leads and appointments work.
-   Trainer can evaluate and version the AI.
-   Business owner can update approved information without model
    retraining.
-   Core flows work end-to-end in a pilot.
