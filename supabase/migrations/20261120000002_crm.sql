-- CRM: prospects, contacts, research, scoring, opportunities, tasks, suppression

create type public.prospect_status as enum (
  'new', 'researched', 'qualified', 'awaiting_approval', 'contacted', 'replied',
  'interested', 'meeting_requested', 'proposal_sent', 'negotiating', 'won', 'lost', 'do_not_contact'
);

create type public.industry as enum (
  'construction', 'hardware', 'automotive', 'retail', 'real_estate', 'manufacturing',
  'professional_services', 'health_fitness', 'hospitality', 'other'
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_name text not null,
  normalized_name text generated always as (lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '', 'g'))) stored,
  country_code char(2) not null,
  city text,
  industry public.industry not null default 'other',
  website_url text,
  website_domain citext,
  instagram_url text,
  phone text,
  public_email citext,
  status public.prospect_status not null default 'new',
  current_score smallint check (current_score between 0 and 100),
  confidence numeric(3,2) check (confidence between 0 and 1),
  source text not null default 'agent', -- agent | manual | import
  owner_user_id uuid references auth.users(id) on delete set null,
  next_follow_up_at timestamptz,
  notes text,
  discovered_by_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Deduplication: one prospect per domain, and per name+country when there is no domain.
create unique index prospects_org_domain_uniq on public.prospects(organization_id, website_domain) where website_domain is not null;
create unique index prospects_org_name_country_uniq on public.prospects(organization_id, normalized_name, country_code);
create index prospects_org_status_idx on public.prospects(organization_id, status);
create index prospects_org_score_idx on public.prospects(organization_id, current_score desc nulls last);
create index prospects_followup_idx on public.prospects(organization_id, next_follow_up_at) where next_follow_up_at is not null;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  full_name text,
  role_title text,
  email citext,
  phone text,
  source_url text, -- where this public contact was found
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prospect_id, email)
);
create index contacts_org_email_idx on public.contacts(organization_id, email);
create unique index contacts_one_primary on public.contacts(prospect_id) where is_primary;

create table public.prospect_research (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  summary text not null,
  website_observations jsonb not null default '{}'::jsonb, -- https, mobile viewport, load time, title/meta, robots status
  opportunities jsonb not null default '[]'::jsonb,         -- [{service, rationale, evidence_url}]
  evidence_urls text[] not null default '{}',
  unverified_claims jsonb not null default '[]'::jsonb,      -- claims whose evidence URL was not in retrieved sources
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  researched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index prospect_research_prospect_idx on public.prospect_research(prospect_id, researched_at desc);

create table public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  service_fit smallint not null check (service_fit between 0 and 100),
  verified_need smallint not null check (verified_need between 0 and 100),
  contact_quality smallint not null check (contact_quality between 0 and 100),
  engagement smallint not null check (engagement between 0 and 100),
  buying_intent smallint not null check (buying_intent between 0 and 100),
  rationale text,
  model_version text not null default 'v1',
  scored_at timestamptz not null default now()
);
create index lead_scores_prospect_idx on public.lead_scores(prospect_id, scored_at desc);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  title text not null,
  service text not null, -- website, redesign, ecommerce, custom_system, seo, other
  stage public.prospect_status not null default 'qualified',
  value_ttd numeric(12,2),
  probability smallint check (probability between 0 and 100),
  expected_close_date date,
  proposal_url text,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_org_stage_idx on public.opportunities(organization_id, stage);

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  title text not null,
  kind text not null default 'follow_up', -- follow_up | call | quote | meeting | review
  due_at timestamptz not null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by text not null default 'user', -- user | agent:<kind>
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index follow_up_tasks_due_idx on public.follow_up_tasks(organization_id, due_at) where completed_at is null;

-- Suppression: checked (in the DB, not just the app) before any send.
create table public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email citext,
  domain citext,
  reason text not null check (reason in ('opt_out', 'bounce', 'complaint', 'manual', 'do_not_contact')),
  source text,
  created_at timestamptz not null default now(),
  check (email is not null or domain is not null)
);
create unique index suppression_email_uniq on public.suppression_list(organization_id, email) where email is not null;
create unique index suppression_domain_uniq on public.suppression_list(organization_id, domain) where domain is not null;

create trigger prospects_touch before update on public.prospects for each row execute function public.touch_updated_at();
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
create trigger opportunities_touch before update on public.opportunities for each row execute function public.touch_updated_at();

-- Marking a prospect Do Not Contact suppresses all its emails automatically.
create or replace function public.prospect_dnc_suppress() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'do_not_contact' and (old.status is distinct from 'do_not_contact') then
    insert into public.suppression_list (organization_id, email, reason, source)
    select new.organization_id, c.email, 'do_not_contact', 'prospect:' || new.id
    from public.contacts c where c.prospect_id = new.id and c.email is not null
    on conflict do nothing;
    if new.public_email is not null then
      insert into public.suppression_list (organization_id, email, reason, source)
      values (new.organization_id, new.public_email, 'do_not_contact', 'prospect:' || new.id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger prospects_dnc after update of status on public.prospects for each row execute function public.prospect_dnc_suppress();
