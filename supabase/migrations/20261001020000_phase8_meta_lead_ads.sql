-- Phase 8: take leads straight from Facebook / Instagram lead ads. Meta posts a
-- leadgen id to our webhook; we fetch the lead with the Page's token and run it
-- through the same intake as the hosted form.

alter table public.leads
  -- The source platform's own id (Meta leadgen id). Meta redelivers webhooks,
  -- and without this a retry would phone the customer twice.
  add column if not exists external_id text;

create unique index if not exists leads_business_external_id_key
  on public.leads (business_id, external_id)
  where external_id is not null;

create table if not exists public.meta_page_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- One business per Page: the webhook routes a lead by page_id alone.
  page_id text not null unique,
  page_name text not null,
  -- Long-lived Page token (does not expire while the owner stays an admin).
  -- Never selected for the browser; only the server reads it.
  page_access_token text not null,
  connected_by uuid references auth.users (id) on delete set null,
  last_lead_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_page_connections_business_id_idx
  on public.meta_page_connections (business_id);

create trigger meta_page_connections_set_updated_at
  before update on public.meta_page_connections
  for each row execute function public.set_updated_at();

-- Deliberately no member policies: RLS cannot hide one column, and the token
-- must not reach the browser. The app reads this table with the service role
-- and selects only safe columns for display.
alter table public.meta_page_connections enable row level security;

create policy "Platform staff manage meta connections"
  on public.meta_page_connections for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());
