-- Security: RLS, approval enforcement, send/publish guards, job claiming, audit, vault access.
--
-- Threat model for approvals: agents run server-side with the service-role key. The service
-- role bypasses RLS but NOT triggers, and has no auth.uid(). Therefore:
--   1. Only a signed-in owner/admin (auth.uid() not null) can move an approval to 'approved'.
--   2. Nobody can insert an approval that is already approved.
--   3. Once decided, an approval's scope is immutable — it can only be revoked.
--   4. An outbound email / IG post cannot reach 'sending'/'publishing' unless consume_approval()
--      recorded a usage for that exact target, which re-validates hash, scope, caps and expiry.
-- Agents can therefore draft and request, but cannot grant themselves permission.

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members m where m.organization_id = p_org and m.user_id = auth.uid());
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.role = any(p_roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: generic org-scoped policies
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create policy org_select on public.organizations for select using (public.is_org_member(id));
create policy org_update on public.organizations for update
  using (public.has_org_role(id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(id, array['owner','admin']::public.org_role[]));

create policy members_select on public.organization_members for select using (public.is_org_member(organization_id));
create policy members_manage on public.organization_members for all
  using (public.has_org_role(organization_id, array['owner']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner']::public.org_role[]));

do $$
declare
  t text;
  -- Tables where members can read and editors (owner/admin/member) can write.
  editable text[] := array[
    'agents', 'agent_runs', 'prospects', 'contacts', 'prospect_research', 'lead_scores',
    'opportunities', 'follow_up_tasks', 'suppression_list', 'outreach_campaigns',
    'email_threads', 'email_messages', 'instagram_prospects', 'content_ideas',
    'content_assets', 'social_posts', 'notifications'
  ];
  -- Read-only to clients; written only by the service layer.
  readonly text[] := array[
    'scheduled_jobs', 'activity_logs', 'approval_usages', 'instagram_accounts',
    'publishing_jobs', 'social_metrics'
  ];
begin
  foreach t in array editable || readonly || array['approval_requests', 'integration_credentials_metadata'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;

  foreach t in array editable loop
    execute format('create policy %I on public.%I for select using (public.is_org_member(organization_id))', t || '_select', t);
    execute format($p$create policy %I on public.%I for insert with check (public.has_org_role(organization_id, array['owner','admin','member']::public.org_role[]))$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update using (public.has_org_role(organization_id, array['owner','admin','member']::public.org_role[])) with check (public.has_org_role(organization_id, array['owner','admin','member']::public.org_role[]))$p$, t || '_update', t);
    execute format($p$create policy %I on public.%I for delete using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))$p$, t || '_delete', t);
  end loop;

  foreach t in array readonly loop
    execute format('create policy %I on public.%I for select using (public.is_org_member(organization_id))', t || '_select', t);
  end loop;
end $$;

-- Approvals: members can view and request; only owner/admin can decide (trigger double-checks).
create policy approval_select on public.approval_requests for select using (public.is_org_member(organization_id));
create policy approval_insert on public.approval_requests for insert
  with check (public.has_org_role(organization_id, array['owner','admin','member']::public.org_role[]));
create policy approval_update on public.approval_requests for update
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- Credential metadata (never the secret) is visible to admins only; no client writes.
create policy icm_select on public.integration_credentials_metadata for select
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- ---------------------------------------------------------------------------
-- Approval lifecycle guard
-- ---------------------------------------------------------------------------
create or replace function public.guard_approval_requests() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  consuming boolean := coalesce(current_setting('app.consuming_approval', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.used_count <> 0 or new.decided_by is not null then
      raise exception 'approval requests must be created pending and unused';
    end if;
    return new;
  end if;

  if new.organization_id <> old.organization_id then
    raise exception 'approval organization is immutable';
  end if;

  -- Scope is immutable once decided. Widening requires a new request.
  if old.status <> 'pending' and (
       new.kind <> old.kind or new.target_type is distinct from old.target_type
    or new.target_id is distinct from old.target_id or new.content_hash is distinct from old.content_hash
    or new.scope <> old.scope or new.max_uses <> old.max_uses or new.expires_at <> old.expires_at
  ) then
    raise exception 'approval scope cannot be changed after a decision; create a new request';
  end if;

  if new.used_count <> old.used_count and not consuming then
    raise exception 'used_count may only change via consume_approval()';
  end if;

  if new.status <> old.status then
    if new.status in ('approved', 'rejected') then
      if old.status <> 'pending' then
        raise exception 'only pending approvals can be decided';
      end if;
      if auth.uid() is null or not public.has_org_role(new.organization_id, array['owner','admin']::public.org_role[]) then
        raise exception 'only an organization owner or admin can decide approvals';
      end if;
      if new.status = 'approved' and new.expires_at <= now() then
        raise exception 'cannot approve an expired request';
      end if;
      new.decided_by := auth.uid();
      new.decided_at := now();
    elsif new.status = 'revoked' then
      -- Withdrawing a still-pending request (e.g. the draft was edited) is open to editors;
      -- revoking a granted approval needs owner/admin. Revoking never grants anything.
      if auth.uid() is null or not public.has_org_role(new.organization_id,
           case when old.status = 'pending' then array['owner','admin','member']::public.org_role[]
                else array['owner','admin']::public.org_role[] end) then
        raise exception 'not permitted to revoke this approval';
      end if;
    elsif new.status = 'exhausted' then
      if not consuming then raise exception 'exhausted is set by the system only'; end if;
    elsif new.status = 'expired' then
      if old.expires_at > now() then raise exception 'approval has not expired'; end if;
    else
      raise exception 'invalid approval status transition % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;

create trigger approval_requests_guard before insert or update on public.approval_requests
  for each row execute function public.guard_approval_requests();

-- ---------------------------------------------------------------------------
-- Suppression check
-- ---------------------------------------------------------------------------
create or replace function public.is_suppressed(p_org uuid, p_email citext) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from suppression_list s
    where s.organization_id = p_org
      and (s.email = p_email or s.domain = split_part(p_email::text, '@', 2)::citext)
  );
$$;

-- ---------------------------------------------------------------------------
-- consume_approval: the single gate for every external action.
-- Idempotent per (approval, target): retrying a failed send does not double-count.
-- ---------------------------------------------------------------------------
create or replace function public.consume_approval(p_approval_id uuid, p_target_type text, p_target_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a approval_requests%rowtype;
  msg email_messages%rowtype;
  post social_posts%rowtype;
  already boolean;
  used_today integer;
  used_week integer;
  allowed_post jsonb;
begin
  select * into a from approval_requests where id = p_approval_id for update;
  if not found then raise exception 'approval % not found', p_approval_id; end if;

  -- Load and validate the target against the approval's bounds.
  if p_target_type = 'email_messages' then
    select * into msg from email_messages where id = p_target_id for update;
    if not found or msg.organization_id <> a.organization_id or msg.direction <> 'outbound' then
      raise exception 'invalid email target';
    end if;
    if public.is_suppressed(msg.organization_id, msg.to_email) then
      raise exception 'recipient % is suppressed', msg.to_email;
    end if;
    if exists (select 1 from prospects p where p.id = msg.prospect_id and p.status = 'do_not_contact') then
      raise exception 'prospect is marked do not contact';
    end if;
    if a.kind = 'email_message' then
      if a.target_id <> msg.id or a.content_hash <> msg.content_hash then
        raise exception 'message changed after approval or does not match approval';
      end if;
    elsif a.kind = 'email_campaign' then
      if msg.campaign_id is distinct from (a.scope->>'campaign_id')::uuid then
        raise exception 'message is not part of the approved campaign';
      end if;
      if not (a.scope->'recipient_contact_ids') ? msg.contact_id::text then
        raise exception 'recipient is not in the approved campaign recipient list';
      end if;
    else
      raise exception 'approval kind % cannot authorize email', a.kind;
    end if;
  elsif p_target_type = 'social_posts' then
    select * into post from social_posts where id = p_target_id for update;
    if not found or post.organization_id <> a.organization_id then raise exception 'invalid post target'; end if;
    if a.kind = 'social_post' then
      if a.target_id <> post.id or a.content_hash <> post.content_hash then
        raise exception 'post changed after approval or does not match approval';
      end if;
    elsif a.kind = 'publishing_schedule' then
      select e into allowed_post from jsonb_array_elements(a.scope->'posts') e where e->>'id' = post.id::text;
      if allowed_post is null then raise exception 'post is not in the approved schedule'; end if;
      if allowed_post->>'hash' <> post.content_hash then raise exception 'post changed after schedule approval'; end if;
    else
      raise exception 'approval kind % cannot authorize publishing', a.kind;
    end if;
  else
    raise exception 'unsupported target type %', p_target_type;
  end if;

  select exists (select 1 from approval_usages u where u.approval_id = a.id and u.target_id = p_target_id) into already;
  if already then
    return; -- idempotent retry of an action already counted
  end if;

  if a.status <> 'approved' then raise exception 'approval is %', a.status; end if;
  if a.expires_at <= now() then raise exception 'approval expired at %', a.expires_at; end if;
  if a.used_count >= a.max_uses then raise exception 'approval volume limit reached'; end if;

  if a.kind = 'email_campaign' and a.scope ? 'daily_cap' then
    select count(*) into used_today from approval_usages u
      where u.approval_id = a.id and u.used_at >= date_trunc('day', now());
    if used_today >= (a.scope->>'daily_cap')::int then raise exception 'campaign daily cap reached'; end if;
  end if;
  if a.kind = 'publishing_schedule' and a.scope ? 'max_per_week' then
    select count(*) into used_week from approval_usages u
      where u.approval_id = a.id and u.used_at >= now() - interval '7 days';
    if used_week >= (a.scope->>'max_per_week')::int then raise exception 'weekly publishing cap reached'; end if;
  end if;

  insert into approval_usages (organization_id, approval_id, target_type, target_id)
  values (a.organization_id, a.id, p_target_type, p_target_id);

  perform set_config('app.consuming_approval', 'on', true);
  update approval_requests
     set used_count = used_count + 1,
         status = case when used_count + 1 >= max_uses then 'exhausted'::approval_status else status end
   where id = a.id;
  perform set_config('app.consuming_approval', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- Send / publish guards: status cannot advance without a recorded approval usage.
-- ---------------------------------------------------------------------------
create or replace function public.guard_outbound_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'outbound' and new.status in ('sending', 'sent')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.approval_id is null or not exists (
      select 1 from approval_usages u where u.approval_id = new.approval_id and u.target_id = new.id
    ) then
      raise exception 'outbound email % has no consumed approval', new.id;
    end if;
  end if;
  return new;
end $$;
create trigger email_messages_send_guard before insert or update on public.email_messages
  for each row execute function public.guard_outbound_email();

create or replace function public.guard_social_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('publishing', 'published') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.approval_id is null or not exists (
      select 1 from approval_usages u where u.approval_id = new.approval_id and u.target_id = new.id
    ) then
      raise exception 'social post % has no consumed approval', new.id;
    end if;
  end if;
  return new;
end $$;
create trigger social_posts_publish_guard before insert or update on public.social_posts
  for each row execute function public.guard_social_publish();

-- ---------------------------------------------------------------------------
-- Job queue
-- ---------------------------------------------------------------------------
create or replace function public.claim_jobs(p_worker text, p_limit integer default 5)
returns setof public.scheduled_jobs
language plpgsql security definer set search_path = public as $$
begin
  -- Recover jobs whose worker died mid-run.
  update scheduled_jobs set status = 'pending', locked_at = null, locked_by = null,
         last_error = coalesce(last_error, '') || ' [lock expired]'
   where status = 'running' and locked_at < now() - interval '15 minutes';

  return query
  update scheduled_jobs j
     set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
   where j.id in (
     select id from scheduled_jobs
      where status = 'pending' and run_at <= now()
      order by run_at
      for update skip locked
      limit p_limit
   )
  returning j.*;
end $$;

-- ---------------------------------------------------------------------------
-- Audit triggers for security-relevant state
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
      into changes
      from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value and n.key not in ('updated_at', 'body_html');
    if changes = '{}'::jsonb then return new; end if;
  end if;
  insert into activity_logs (organization_id, actor_type, actor_id, action, entity_type, entity_id, details)
  values (
    (rec->>'organization_id')::uuid,
    case when auth.uid() is not null then 'user' else 'system' end,
    auth.uid()::text,
    lower(tg_op),
    tg_table_name,
    rec->>'id',
    case when tg_op = 'UPDATE' then changes else '{}'::jsonb end
  );
  return coalesce(new, old);
end $$;

create trigger audit_approval_requests after insert or update or delete on public.approval_requests for each row execute function public.audit_row_change();
create trigger audit_suppression after insert or update or delete on public.suppression_list for each row execute function public.audit_row_change();
create trigger audit_email_status after update of status on public.email_messages for each row execute function public.audit_row_change();
create trigger audit_social_status after update of status on public.social_posts for each row execute function public.audit_row_change();
create trigger audit_prospect_status after update of status on public.prospects for each row execute function public.audit_row_change();
create trigger audit_members after insert or update or delete on public.organization_members for each row execute function public.audit_row_change();
create trigger audit_credentials after insert or update or delete on public.integration_credentials_metadata for each row execute function public.audit_row_change();

-- activity_logs is append-only even for the service role.
create or replace function public.forbid_mutation() returns trigger language plpgsql as $$
begin raise exception 'activity_logs is append-only'; end $$;
create trigger activity_logs_immutable before update or delete on public.activity_logs
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Vault-backed secrets (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.store_integration_secret(
  p_org uuid, p_provider public.integration_provider, p_external_account_id text,
  p_account_label text, p_scopes text[], p_secret text, p_expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public, vault as $$
declare
  existing integration_credentials_metadata%rowtype;
  sid uuid;
  cred_id uuid;
begin
  select * into existing from integration_credentials_metadata
   where organization_id = p_org and provider = p_provider and external_account_id = p_external_account_id;
  if found and existing.vault_secret_id is not null then
    perform vault.update_secret(existing.vault_secret_id, p_secret);
    update integration_credentials_metadata
       set status = 'connected', scopes = p_scopes, account_label = p_account_label,
           expires_at = p_expires_at, last_verified_at = now()
     where id = existing.id;
    return existing.id;
  end if;
  sid := vault.create_secret(p_secret, format('%s:%s:%s', p_org, p_provider, p_external_account_id), 'integration credential');
  insert into integration_credentials_metadata
    (organization_id, provider, external_account_id, account_label, scopes, vault_secret_id, expires_at, last_verified_at)
  values (p_org, p_provider, p_external_account_id, p_account_label, p_scopes, sid, p_expires_at, now())
  returning id into cred_id;
  return cred_id;
end $$;

create or replace function public.get_integration_secret(p_credential_id uuid) returns text
language sql security definer set search_path = public, vault as $$
  select d.decrypted_secret
    from integration_credentials_metadata m
    join vault.decrypted_secrets d on d.id = m.vault_secret_id
   where m.id = p_credential_id and m.status = 'connected';
$$;

-- ---------------------------------------------------------------------------
-- Org bootstrap (called by a signed-in user)
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  insert into organizations (name, slug) values (p_name, p_slug) returning id into org_id;
  insert into organization_members (organization_id, user_id, role) values (org_id, auth.uid(), 'owner');
  insert into agents (organization_id, kind, name, allowed_actions) values
    (org_id, 'lead_discovery',    'Lead Discovery',               array['create_prospect', 'record_research']),
    (org_id, 'sales_rep',         'Sales Representative',         array['draft_email', 'request_approval', 'classify_reply']),
    (org_id, 'crm_manager',       'CRM Manager',                  array['score_lead', 'create_task', 'daily_summary']),
    (org_id, 'content_creator',   'Instagram Content Creator',    array['create_content', 'request_approval']),
    (org_id, 'growth_strategist', 'Instagram Growth Strategist',  array['research_accounts', 'recommend']);
  return org_id;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.consume_approval(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_jobs(text, integer) from public, anon, authenticated;
revoke all on function public.store_integration_secret(uuid, public.integration_provider, text, text, text[], text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_integration_secret(uuid) from public, anon, authenticated;
grant execute on function public.consume_approval(uuid, text, uuid) to service_role;
grant execute on function public.claim_jobs(text, integer) to service_role;
grant execute on function public.store_integration_secret(uuid, public.integration_provider, text, text, text[], text, timestamptz) to service_role;
grant execute on function public.get_integration_secret(uuid) to service_role;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: org members can read their org's content folder: content/<org_id>/...
-- ---------------------------------------------------------------------------
create policy content_read on storage.objects for select
  using (bucket_id = 'content' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy content_write on storage.objects for insert
  with check (bucket_id = 'content' and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin','member']::public.org_role[]));
