-- WebCraft Growth AI — core tenancy, agents, jobs, audit
-- All tables are org-scoped. RLS is enabled in 20261120000005_security.sql.

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.agent_kind as enum (
  'lead_discovery', 'sales_rep', 'crm_manager', 'content_creator', 'growth_strategist'
);
create type public.run_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.job_status as enum ('pending', 'running', 'succeeded', 'failed', 'dead');
create type public.integration_provider as enum ('anthropic', 'gmail', 'smtp', 'meta_instagram', 'image_openai');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  country_code char(2) not null default 'TT',
  timezone text not null default 'America/Port_of_Spain',
  sender_identity jsonb not null default '{}'::jsonb, -- legal name, postal address, signature (CAN-SPAM style footer)
  settings jsonb not null default jsonb_build_object(
    'daily_prospect_target', 10,
    'posts_per_week', 4,
    'daily_email_cap', 40,
    'demo_mode', false
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);

-- ---------------------------------------------------------------------------
-- Agents and runs
-- ---------------------------------------------------------------------------
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.agent_kind not null,
  name text not null,
  enabled boolean not null default true,
  model text not null default 'claude-sonnet-5-5',
  config jsonb not null default '{}'::jsonb,
  -- Agents never hold approval permission; this column documents what they may *request*.
  allowed_actions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind)
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  status public.run_status not null default 'queued',
  trigger text not null default 'manual', -- manual | schedule | event
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10,4) not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index agent_runs_org_created_idx on public.agent_runs(organization_id, created_at desc);
create index agent_runs_agent_idx on public.agent_runs(agent_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Durable job queue (Postgres-backed, claimed with FOR UPDATE SKIP LOCKED)
-- ---------------------------------------------------------------------------
create table public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status public.job_status not null default 'pending',
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  result jsonb,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index scheduled_jobs_claim_idx on public.scheduled_jobs(status, run_at) where status in ('pending', 'running');

-- ---------------------------------------------------------------------------
-- Notifications and audit
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, -- null = whole org
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_org_unread_idx on public.notifications(organization_id, created_at desc) where read_at is null;

-- Append-only audit trail. Written by triggers and by the service layer.
create table public.activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'agent', 'system')),
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_org_created_idx on public.activity_logs(organization_id, created_at desc);
create index activity_logs_entity_idx on public.activity_logs(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Integration credentials: METADATA ONLY. Secrets live in Supabase Vault;
-- this table stores the vault secret id, never the token itself.
-- ---------------------------------------------------------------------------
create table public.integration_credentials_metadata (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider public.integration_provider not null,
  account_label text, -- e.g. sender email or IG username (non-secret)
  external_account_id text,
  scopes text[] not null default '{}',
  vault_secret_id uuid, -- references vault.secrets(id); not exposed to clients
  status text not null default 'connected' check (status in ('connected', 'expired', 'revoked', 'error')),
  expires_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_account_id)
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger agents_touch before update on public.agents for each row execute function public.touch_updated_at();
create trigger scheduled_jobs_touch before update on public.scheduled_jobs for each row execute function public.touch_updated_at();
create trigger icm_touch before update on public.integration_credentials_metadata for each row execute function public.touch_updated_at();
