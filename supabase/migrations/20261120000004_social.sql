-- Instagram: accounts, audience research, content, publishing, metrics

-- array_to_string is STABLE; generated columns need IMMUTABLE. Text/uuid output is deterministic, so this is safe.
create or replace function public.immutable_join(arr anyarray) returns text
language sql immutable parallel safe as $$ select array_to_string(arr, ',') $$;

create table public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ig_user_id text not null,
  username text not null,
  page_id text,
  credential_id uuid references public.integration_credentials_metadata(id) on delete set null,
  followers_count integer,
  media_count integer,
  connected_at timestamptz not null default now(),
  unique (organization_id, ig_user_id)
);

-- Accounts worth engaging with MANUALLY. No automated follow/like/DM anywhere in the system.
create table public.instagram_prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  username text not null,
  profile_url text generated always as ('https://www.instagram.com/' || username || '/') stored,
  display_name text,
  country_code char(2),
  industry public.industry,
  followers_count integer,
  media_count integer,
  category text check (category in ('potential_client', 'collaborator', 'community', 'media', 'peer')),
  reason text not null,
  suggested_engagement text, -- e.g. "comment on their launch post about X"
  linked_prospect_id uuid references public.prospects(id) on delete set null,
  review_status text not null default 'to_review' check (review_status in ('to_review', 'followed_manually', 'engaged', 'dismissed')),
  data_source text not null default 'business_discovery', -- business_discovery | web_research | manual
  researched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, username)
);

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  format text not null check (format in ('single_image', 'carousel', 'before_after', 'portfolio', 'reel')),
  pillar text not null, -- education | portfolio | promotion | behind_the_scenes | community
  title text not null,
  brief text not null,
  status text not null default 'idea' check (status in ('idea', 'in_production', 'ready', 'archived')),
  created_by text not null default 'agent:content_creator',
  created_at timestamptz not null default now()
);

create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_idea_id uuid references public.content_ideas(id) on delete set null,
  kind text not null check (kind in ('image', 'video', 'storyboard_frame', 'script')),
  storage_path text,        -- Supabase Storage path in bucket "content"
  public_url text,          -- signed/public URL Meta can fetch at publish time
  width integer,
  height integer,
  generator text not null,  -- template:<name> | openai:<model> | upload
  is_ai_generated boolean not null default false,
  -- Real portfolio material must carry explicit authorization from the client.
  is_client_work boolean not null default false,
  client_authorization_note text,
  prompt text,
  spec jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not is_client_work or client_authorization_note is not null)
);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instagram_account_id uuid references public.instagram_accounts(id) on delete set null,
  content_idea_id uuid references public.content_ideas(id) on delete set null,
  media_type text not null check (media_type in ('IMAGE', 'CAROUSEL', 'REELS')),
  caption text not null default '',
  hashtags text[] not null default '{}',
  asset_ids uuid[] not null default '{}',
  reel_script text,
  status text not null default 'draft' check (status in (
    'draft', 'awaiting_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'
  )),
  scheduled_for timestamptz,
  content_hash text generated always as (
    md5(media_type || '|' || caption || '|' || public.immutable_join(hashtags) || '|' || public.immutable_join(asset_ids))
  ) stored,
  approval_id uuid references public.approval_requests(id) on delete set null,
  ig_media_id text,
  permalink text,
  published_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_posts_org_sched_idx on public.social_posts(organization_id, scheduled_for);
create index social_posts_org_status_idx on public.social_posts(organization_id, status);

create table public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  social_post_id uuid not null references public.social_posts(id) on delete cascade,
  step text not null default 'create_container' check (step in ('create_container', 'await_container', 'publish', 'done')),
  container_id text,
  child_container_ids text[] not null default '{}',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_post_id)
);

create table public.social_metrics (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instagram_account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  social_post_id uuid references public.social_posts(id) on delete cascade,
  scope text not null check (scope in ('account', 'media')),
  metric text not null,     -- views, reach, total_interactions, follower_count, profile_links_taps, ...
  value numeric not null,
  period_start date not null,
  captured_at timestamptz not null default now()
);
create unique index social_metrics_uniq on public.social_metrics(
  instagram_account_id, coalesce(social_post_id, '00000000-0000-0000-0000-000000000000'::uuid), scope, metric, period_start
);

create trigger social_posts_touch before update on public.social_posts for each row execute function public.touch_updated_at();
create trigger publishing_jobs_touch before update on public.publishing_jobs for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public) values ('content', 'content', false) on conflict do nothing;
