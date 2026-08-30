# AI Employee Platform

Managed AI employees for Indian businesses. Business owners manage facts (prices, stock, offers, documents). Internal AI trainers prepare behaviour, tests, and versions. The **Business Brain** keeps current business data separate from conversational behaviour.

**Source of truth:** [docs/AI_Employee_Master_Product_Spec.pdf](docs/AI_Employee_Master_Product_Spec.pdf)

## Phase 1 status

| Goal | Status |
|------|--------|
| Repository scaffold (Next.js + TypeScript + Tailwind) | Done |
| Environment placeholders (Supabase) | Done |
| Base UI: landing, business dashboard shell, trainer shell | Done |

Phase 1 does **not** require a live Supabase project. Auth, RLS, and database work start in Phase 2.

## Stack (from master spec)

- Next.js App Router + React + TypeScript + Tailwind
- Next.js server/API layer (no separate Python backend)
- Supabase for Postgres, Auth, and Storage (from Phase 2)
- Zod and provider adapters in later phases

## Quick start

```bash
npm install
cp .env.example .env.local   # optional for Phase 1
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Route | Purpose |
|-------|---------|
| `/` | Product landing |
| `/dashboard` | Business owner shell |
| `/trainer` | Internal AI trainer shell |

```bash
npm run build
npm run lint
```

## Environment

Copy `.env.example` to `.env.local` when you are ready for Phase 2:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never ship to the browser)

Client stubs live in `src/lib/supabase/` and return `null` until those values are set.

## Project structure

```text
docs/                  Master spec + supporting briefs
src/app/               Routes (landing, dashboard, trainer)
src/components/        Shell and shared UI
src/lib/               Env helpers, navigation, Supabase stubs
```

## Roadmap (master spec)

1. Repository + environment + base UI ← **current**
2. Database + Auth + RLS
3. Application shell/routes
4. Business onboarding
5. Business Brain structured data
6. File upload + knowledge
7. AI Trainer Console
8. AI Test Lab
9. AI Orchestrator + tools
10. Voice integration
11. WhatsApp
12. Leads + appointments
13. Business dashboard
14. Continuous improvement
15. AI versioning + deployment
16–20. Hardening, polish, security, production, pilot

## Cursor build contract

- Treat the master PDF as the source of truth
- Build one phase at a time; keep the app runnable after each phase
- Business data is runtime truth; never fabricate missing facts
- Do not put secrets in code or docs
