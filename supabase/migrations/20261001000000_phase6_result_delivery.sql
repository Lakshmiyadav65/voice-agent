-- Phase 6: push each finished call to wherever the owner works (email, a
-- Google Sheet, or their own system via webhook) instead of making them
-- check the dashboard.

create table if not exists public.delivery_targets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('email', 'sheet', 'webhook')),
  -- An email address for 'email', an https URL for 'sheet' and 'webhook'.
  destination text not null,
  -- Signs webhook bodies so receivers can reject forged requests.
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  last_status text check (last_status in ('sent', 'failed')),
  last_error text,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_targets_business_id_idx on public.delivery_targets (business_id);

create trigger delivery_targets_set_updated_at
  before update on public.delivery_targets
  for each row execute function public.set_updated_at();

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.delivery_targets (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  call_attempt_id uuid not null references public.call_attempts (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  response_code integer,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sarvam may retry its webhook; the first insert claims the send so a retry
  -- cannot email the owner twice about the same call.
  unique (target_id, call_attempt_id)
);

create index if not exists deliveries_business_id_idx on public.deliveries (business_id);
create index if not exists deliveries_call_attempt_id_idx on public.deliveries (call_attempt_id);

create trigger deliveries_set_updated_at
  before update on public.deliveries
  for each row execute function public.set_updated_at();

alter table public.delivery_targets enable row level security;
alter table public.deliveries enable row level security;

create policy "Members read delivery targets"
  on public.delivery_targets for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Owners manage delivery targets"
  on public.delivery_targets for all
  using (public.is_business_owner(business_id) or public.is_platform_staff())
  with check (public.is_business_owner(business_id) or public.is_platform_staff());

create policy "Members read deliveries"
  on public.deliveries for select
  using (public.is_business_member(business_id) or public.is_platform_staff());
