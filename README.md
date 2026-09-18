# AI Employee Platform

Managed AI employees for Indian businesses. Business owners manage facts (prices, stock, offers, documents). Internal AI trainers prepare behaviour, tests, and versions. The **Business Brain** keeps current business data separate from conversational behaviour.

**Source of truth:** [docs/AI_Employee_Master_Product_Spec.pdf](docs/AI_Employee_Master_Product_Spec.pdf)

## Phase status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Repository + environment + base UI | Done |
| 2 | Database + Auth + RLS | Done |
| 3 | Application shell/routes | Next |

## Stack

- Next.js App Router + React + TypeScript + Tailwind
- Supabase (Postgres, Auth, RLS)
- Zod and provider adapters in later phases

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Phase 2 — Supabase setup

1. Create a [Supabase](https://supabase.com) project.
2. Copy project URL, anon key, and service role key into `.env.local`.
3. Apply migrations (Supabase SQL editor or CLI):

```bash
# With Supabase CLI + Docker
supabase db push

# Or paste supabase/migrations/20260831000000_phase2_core_auth_rls.sql into the SQL editor
```

4. Seed demo users and business data:

```bash
npm run db:seed
```

### Demo logins

| Email | Password | Role | Redirect |
|-------|----------|------|----------|
| `ravi@srimobile.in` | `OwnerPass123` | Business owner | `/dashboard` |
| `trainer@platform.in` | `TrainerPass123` | AI trainer | `/trainer` |
| `admin@platform.in` | `AdminPass123` | Admin | `/trainer` |

### What Phase 2 includes

- `profiles`, `businesses`, `business_members`, `ai_employees`, `ai_versions` tables
- Row Level Security for tenant isolation
- Supabase Auth login/logout
- Protected `/dashboard` and `/trainer` routes with role-based redirects
- Seed script for demo data

```bash
npm run test:roles   # role routing unit checks
npm run build
npm run lint
```

## Environment

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server-only, for seed script
```

## Project structure

```text
docs/                     Product specs
supabase/migrations/      Database schema + RLS
scripts/                  Seed and test scripts
src/app/                  Routes (landing, login, dashboard, trainer)
src/components/           UI and auth components
src/lib/auth/             Session and role helpers
src/lib/supabase/         Supabase clients + middleware
```

## Roadmap (master spec)

1. Repository + environment + base UI ✓
2. Database + Auth + RLS ✓
3. Application shell/routes
4. Business onboarding
5. Business Brain structured data
6–20. Knowledge, trainer console, voice, WhatsApp, pilot, production
