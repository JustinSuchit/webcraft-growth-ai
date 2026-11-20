-- Outreach: approvals, campaigns, threads, messages

create type public.approval_kind as enum ('email_message', 'email_campaign', 'social_post', 'publishing_schedule');
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'revoked', 'expired', 'exhausted');

-- An approval is a human grant of a precisely bounded permission.
--  * email_message / social_post: bound to ONE target and its content_hash.
--    Any edit to the content changes the hash and voids the approval.
--  * email_campaign: bound to an explicit recipient snapshot + volume caps + expiry.
--  * publishing_schedule: bound to an explicit list of approved posts + weekly cap + expiry.
-- Once approved, the scope columns are immutable (enforced by trigger). Widening = new request.
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.approval_kind not null,
  status public.approval_status not null default 'pending',
  title text not null,
  summary text,
  target_type text,            -- email_messages | outreach_campaigns | social_posts
  target_id uuid,
  content_hash text,           -- required for single-target kinds
  scope jsonb not null default '{}'::jsonb,
  -- email_campaign: {"recipient_contact_ids": [...], "daily_cap": 20}
  -- publishing_schedule: {"social_post_ids": [...], "max_per_week": 4}
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz not null default (now() + interval '14 days'),
  requested_by text not null,  -- 'agent:sales_rep' | 'user:<uuid>'
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (used_count <= max_uses),
  check (kind not in ('email_message', 'social_post') or (target_id is not null and content_hash is not null and max_uses = 1))
);
create index approval_requests_org_status_idx on public.approval_requests(organization_id, status, created_at desc);
create index approval_requests_target_idx on public.approval_requests(target_type, target_id);

-- Every consumption of an approval is recorded; unique per target = idempotent sends.
create table public.approval_usages (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  approval_id uuid not null references public.approval_requests(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  used_at timestamptz not null default now(),
  unique (approval_id, target_id)
);
create index approval_usages_day_idx on public.approval_usages(approval_id, used_at);

create table public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'awaiting_approval', 'active', 'paused', 'completed')),
  services text[] not null default '{}',
  target_criteria jsonb not null default '{}'::jsonb,
  daily_cap integer not null default 20 check (daily_cap between 1 and 200),
  total_cap integer not null default 100 check (total_cap between 1 and 2000),
  starts_at timestamptz,
  ends_at timestamptz,
  approval_id uuid references public.approval_requests(id) on delete set null,
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.outreach_campaigns(id) on delete set null,
  provider_thread_id text,
  subject text,
  last_message_at timestamptz,
  last_classification text,
  needs_attention boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, provider_thread_id)
);
create index email_threads_org_last_idx on public.email_threads(organization_id, last_message_at desc);

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid references public.email_threads(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.outreach_campaigns(id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  status text not null default 'draft' check (status in (
    'draft', 'awaiting_approval', 'approved', 'sending', 'sent', 'failed', 'cancelled', 'received'
  )),
  from_email citext,
  to_email citext,
  subject text,
  body_text text,
  body_html text,
  -- Changes whenever recipient/subject/body change → voids single-message approvals.
  content_hash text generated always as (
    md5(coalesce(to_email::text, '') || '|' || coalesce(subject, '') || '|' || coalesce(body_text, ''))
  ) stored,
  approval_id uuid references public.approval_requests(id) on delete set null,
  provider_message_id text,
  rfc_message_id text,
  in_reply_to text,
  classification text check (classification in (
    'interested', 'meeting_request', 'quote_request', 'question', 'not_interested',
    'opt_out', 'out_of_office', 'bounce', 'other'
  )),
  ai_generated boolean not null default true,
  idempotency_key text,
  error text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (organization_id, provider_message_id)
);
create index email_messages_org_status_idx on public.email_messages(organization_id, status, created_at desc);
create index email_messages_prospect_idx on public.email_messages(prospect_id, created_at desc);
create index email_messages_thread_idx on public.email_messages(thread_id, created_at);

create trigger approval_requests_touch before update on public.approval_requests for each row execute function public.touch_updated_at();
create trigger outreach_campaigns_touch before update on public.outreach_campaigns for each row execute function public.touch_updated_at();
create trigger email_messages_touch before update on public.email_messages for each row execute function public.touch_updated_at();
