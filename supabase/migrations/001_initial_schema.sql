-- SENTRIX initial schema — Supabase / PostgreSQL
-- Apply in a dedicated Supabase project. Never put service_role keys in the browser.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'SENTRIX user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  normalized_host text not null,
  authorization_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique(owner_id, normalized_host),
  constraint assets_https_or_http check (url ~* '^https?://')
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  scope_note text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  severity text not null check (severity in ('info','low','medium','high','critical')),
  title text not null,
  description text not null,
  remediation text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assets_owner_idx on public.assets(owner_id);
create index if not exists assessments_asset_idx on public.assessments(asset_id);
create index if not exists findings_assessment_idx on public.findings(assessment_id);
create index if not exists audit_actor_created_idx on public.audit_events(actor_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.assessments enable row level security;
alter table public.findings enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "assets owner access" on public.assets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "assessments owner read" on public.assessments for select to authenticated
  using (requested_by = auth.uid() and exists (select 1 from public.assets a where a.id = asset_id and a.owner_id = auth.uid()));
-- Assessment creation and status transitions belong to a trusted server/Edge Function, not the browser.
create policy "findings owner read" on public.findings for select to authenticated
  using (exists (select 1 from public.assessments s join public.assets a on a.id = s.asset_id where s.id = assessment_id and a.owner_id = auth.uid()));
-- Findings and audit events are server-written only.
create policy "audit owner read" on public.audit_events for select to authenticated
  using (actor_id = auth.uid() or exists (select 1 from public.assets a where a.id = asset_id and a.owner_id = auth.uid()));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'SENTRIX user'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- No scanner is implemented by this migration. Do not create fake assessments or findings.
