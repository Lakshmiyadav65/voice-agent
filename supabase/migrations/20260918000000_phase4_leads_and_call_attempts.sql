-- Phase 4: Ad Lead Capture and Automated Outbound Call Follow-up
-- Leads arrive from public ad forms, trigger an instant Sarvam voice call,
-- and the call outcome is written back by the Sarvam webhook.

-- ---------------------------------------------------------------------------
-- Leads (submissions from public ad landing forms)
-- ---------------------------------------------------------------------------

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ai_employee_id uuid references public.ai_employees (id) on delete set null,
  name text not null,
  phone text not null,
  email text,
  enquiry text,
  source text not null default 'ad_form',
  utm jsonb not null default '{}'::jsonb,
  -- Hashed, not raw: only ever compared against itself for abuse throttling.
  ip_hash text,
  status text not null default 'new' check (status in ('new', 'calling', 'contacted', 'unreachable', 'converted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_business_id_idx on public.leads (business_id);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- Throttling lookups: recent submissions per number and per origin
create index if not exists leads_phone_created_at_idx on public.leads (phone, created_at desc);
create index if not exists leads_ip_hash_created_at_idx on public.leads (ip_hash, created_at desc);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Call attempts (one row per Sarvam outbound dial, updated by the webhook)
-- ---------------------------------------------------------------------------

create table if not exists public.call_attempts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  attempt_id text not null unique,
  interaction_id text,
  status text not null default 'dispatched' check (status in ('dispatched', 'connected', 'no_answer', 'busy', 'failed')),
  duration integer,
  failure_reason text,
  transcript jsonb,
  final_variables jsonb,
  summary text,
  visit_requested boolean,
  preferred_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_attempts_lead_id_idx on public.call_attempts (lead_id);
create index if not exists call_attempts_business_id_idx on public.call_attempts (business_id);
create index if not exists call_attempts_visit_requested_idx on public.call_attempts (visit_requested) where visit_requested;

create trigger call_attempts_set_updated_at
  before update on public.call_attempts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Writes are intentionally absent: leads are created by the public intake
-- endpoint and call outcomes by the Sarvam webhook, both of which use the
-- service role and bypass RLS. Authenticated users only ever read.
-- ---------------------------------------------------------------------------

alter table public.leads enable row level security;
alter table public.call_attempts enable row level security;

create policy "Members read business leads"
  on public.leads for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Members update business leads"
  on public.leads for update
  using (public.is_business_member(business_id) or public.is_platform_staff())
  with check (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Owners delete business leads"
  on public.leads for delete
  using (public.is_business_owner(business_id) or public.is_platform_staff());

create policy "Members read business call attempts"
  on public.call_attempts for select
  using (public.is_business_member(business_id) or public.is_platform_staff());
