-- Phase 2: core schema, auth profiles, and tenant RLS

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  platform_role text not null check (platform_role in ('business_owner', 'trainer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_platform_role_idx on public.profiles (platform_role);

-- ---------------------------------------------------------------------------
-- Businesses and membership
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  phone text,
  email text,
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'active' check (status in ('active', 'inactive', 'onboarding')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_members_user_id_idx on public.business_members (user_id);
create index business_members_business_id_idx on public.business_members (business_id);

-- ---------------------------------------------------------------------------
-- AI employees and versions
-- ---------------------------------------------------------------------------

create table public.ai_employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'testing', 'live', 'paused')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_employees_business_id_idx on public.ai_employees (business_id);

create table public.ai_versions (
  id uuid primary key default gen_random_uuid(),
  ai_employee_id uuid not null references public.ai_employees (id) on delete cascade,
  version_number integer not null,
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'testing', 'approved', 'live', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  deployed_at timestamptz,
  unique (ai_employee_id, version_number)
);

create index ai_versions_ai_employee_id_idx on public.ai_versions (ai_employee_id);

alter table public.ai_employees
  add constraint ai_employees_current_version_id_fkey
  foreign key (current_version_id) references public.ai_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

create trigger ai_employees_set_updated_at
  before update on public.ai_employees
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth: auto-create profile row (role set by seed/admin)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, platform_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'platform_role', 'business_owner')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and platform_role in ('trainer', 'admin')
  );
$$;

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = target_business_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_business_owner(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = target_business_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.ai_employees enable row level security;
alter table public.ai_versions enable row level security;

-- profiles
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_platform_staff());

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Platform staff manage profiles"
  on public.profiles for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

-- businesses
create policy "Members read their businesses"
  on public.businesses for select
  using (public.is_business_member(id) or public.is_platform_staff());

create policy "Owners update their businesses"
  on public.businesses for update
  using (public.is_business_owner(id) or public.is_platform_staff());

create policy "Platform staff manage businesses"
  on public.businesses for insert
  with check (public.is_platform_staff());

create policy "Platform staff delete businesses"
  on public.businesses for delete
  using (public.is_platform_staff());

-- business_members
create policy "Members read business membership"
  on public.business_members for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Owners manage business membership"
  on public.business_members for all
  using (public.is_business_owner(business_id) or public.is_platform_staff())
  with check (public.is_business_owner(business_id) or public.is_platform_staff());

-- ai_employees
create policy "Members read ai employees"
  on public.ai_employees for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Staff manage ai employees"
  on public.ai_employees for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

-- ai_versions
create policy "Members read ai versions"
  on public.ai_versions for select
  using (
    exists (
      select 1 from public.ai_employees ae
      where ae.id = ai_versions.ai_employee_id
        and (public.is_business_member(ae.business_id) or public.is_platform_staff())
    )
  );

create policy "Staff manage ai versions"
  on public.ai_versions for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());
