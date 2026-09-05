-- Private preparation only. Activation and actual distribution belong to #56.
grant identity_service to postgres;
create schema promotion_private;
revoke all on schema promotion_private from public,anon,authenticated;
grant usage,create on schema promotion_private to identity_service;
grant usage on schema promotion_private to account_lifecycle_service;
grant create on schema app_public to identity_service;

create table promotion_private.capability (
  id boolean primary key default true check(id),
  distribution_enabled boolean not null default false,
  measurement_enabled boolean not null default false
);
insert into promotion_private.capability default values;
create table promotion_private.channel_permissions (
  permission_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid references app_public.stores(id),
  channel text not null check(channel in ('flyer','owner_card','co_brand','social')),
  actor_id uuid references auth.users(id) on delete set null,
  grant_id uuid references partner_private.store_partner_grants(grant_id),
  consented boolean not null default false,
  removal_requested boolean not null default false,
  version bigint not null default 1,
  changed_at timestamptz not null default statement_timestamp(),
  unique nulls not distinct(store_id,channel),
  check(store_id is not null or channel='owner_card')
);
create table promotion_private.channel_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  permission_id uuid not null,
  operation text not null check(operation in ('consent','withdraw','distribute','reprint','post')),
  allowed boolean not null,
  created_at timestamptz not null default statement_timestamp()
);
-- Deliberately no event-level campaign data, actor, store, request, IP or device field.
create table promotion_private.sources (
  code text primary key default encode(extensions.gen_random_bytes(16),'hex') check(code ~ '^[a-f0-9]{32}$'),
  active boolean not null default false
);
create table promotion_private.daily_counts (
  code text not null references promotion_private.sources(code),
  day date not null,
  event text not null check(event in ('open','details','share')),
  count bigint not null check(count>0),
  primary key(code,day,event)
);
-- Signed gate totals stay in the existing signed release receipt system; no
-- public command may create a claimed signed aggregate or supply a timestamp.
do $$ declare t text; begin
  foreach t in array array['capability','channel_permissions','channel_events','sources','daily_counts'] loop
    execute format('alter table promotion_private.%I enable row level security',t);
    execute format('alter table promotion_private.%I force row level security',t);
    execute format('revoke all on promotion_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on promotion_private.%I to identity_service',t);
    execute format('create policy service_access on promotion_private.%I for all to identity_service using(true) with check(true)',t);
  end loop;
end $$;
revoke insert,update,delete on promotion_private.capability,promotion_private.sources from identity_service;
-- Row locking needs UPDATE privilege; the constrained singleton key cannot activate a flag.
grant update(id) on promotion_private.capability to identity_service;
grant update(code) on promotion_private.sources to identity_service;
grant execute on function release_private.lock_rg01_release(uuid) to identity_service;

create function app_public.promotion_channels() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare target uuid:=portal_private.require_portal_scope();
begin
  return (select jsonb_agg(jsonb_build_object('channel',c,'consented',coalesce(p.consented and p.actor_id=app_public.request_user_id()
    and p.grant_id=(select g.grant_id from partner_private.store_partner_grants g where g.store_id=target and g.auth_user_id=app_public.request_user_id() and g.state='active'),false),
    'version',coalesce(p.version,0),'removalRequested',coalesce(p.removal_requested,false),'distributionAllowed',false) order by c)
    from unnest(array['flyer','owner_card','co_brand','social']) c
    left join promotion_private.channel_permissions p on p.store_id=target and p.channel=c);
end $$;

create function app_public.promotion_channel_command(p_channel text,p_operation text,p_version bigint,p_generic_owner_card boolean default false)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid; scope_grant uuid;
  p promotion_private.channel_permissions%rowtype; release_id uuid; allowed boolean:=false; is_admin boolean:=false;
begin
  if p_channel is null or p_channel not in ('flyer','owner_card','co_brand','social') or p_operation is null
    or p_operation not in ('consent','withdraw','distribute','reprint','post') or p_version is null or p_version<0
    or p_generic_owner_card is null then raise exception using errcode='22023',message='promotion_unavailable'; end if;
  -- Lock the live release before scope/permission locks, matching release rollback.
  if p_operation in ('distribute','reprint','post') then
    select r.release_id into release_id from release_private.regional_releases r
      where r.region_key='topeka-ks' and r.state='active';
    perform release_private.lock_rg01_release(release_id);
    perform 1 from promotion_private.capability for share;
  end if;
  if p_generic_owner_card then
    is_admin:=app_private.current_user_has_role('administrator',null);
    if p_channel<>'owner_card' or actor is null or not is_admin or not app_private.current_session_is_active()
      or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '10 minutes')
      then raise exception using errcode='42501',message='promotion_unavailable'; end if;
    -- Generic acquisition permission has no prospective recipient or store identity.
  else
    target:=portal_private.require_portal_scope();
    select g.grant_id into scope_grant from partner_private.store_partner_grants g
      where g.auth_user_id=actor and g.store_id=target and g.state='active' for update;
    if scope_grant is null or portal_private.require_portal_scope() is distinct from target
      then raise exception using errcode='42501',message='promotion_unavailable'; end if;
  end if;
  insert into promotion_private.channel_permissions(store_id,channel) values(target,p_channel)
    on conflict(store_id,channel) do nothing;
  select * into p from promotion_private.channel_permissions
    where store_id is not distinct from target and channel=p_channel for update;
  if p.version<>p_version and not (p.version=1 and p.actor_id is null and p_version=0)
    then raise exception using errcode='40001',message='promotion_changed'; end if;
  if p_operation in ('consent','withdraw') then
    update promotion_private.channel_permissions set consented=p_operation='consent',actor_id=actor,grant_id=scope_grant,
      removal_requested=p_operation='withdraw',version=version+1,changed_at=statement_timestamp()
      where permission_id=p.permission_id returning * into p;
    allowed:=true;
    -- Preserve RG-01's independent flyer history, including withdrawals while its gate is off.
    if p_channel='flyer' and p_operation='withdraw' then
      update rg01_private.rg01_flyer_consents set withdrawn_at=statement_timestamp()
        where store_id=target and withdrawn_at is null;
    end if;
  else
    allowed:=p.consented and p.actor_id=actor and p.grant_id is not distinct from scope_grant
      and (select distribution_enabled from promotion_private.capability)
      and release_private.public_capability_enabled('promotion')
      and ((p_channel='social' and p_operation='post') or (p_channel<>'social' and p_operation in ('distribute','reprint')))
      and (target is null or rg01_private.promotion_consent_receipt_digest(release_id,target) is not null);
    allowed:=coalesce(allowed,false);
    -- A fresh version is required for every authorized use; stale approvals cannot replay after withdrawal.
    if allowed then
      update promotion_private.channel_permissions set version=version+1,
        consented=case when p_channel='social' then false else consented end
        where permission_id=p.permission_id returning * into p;
    end if;
  end if;
  insert into promotion_private.channel_events(permission_id,operation,allowed) values(p.permission_id,p_operation,allowed);
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,case when is_admin then 'administrator'::app_private.app_role else 'representative'::app_private.app_role end,
      'promotion_'||p_operation,case when allowed then 'completed' else 'denied' end,'promotion_permission',p.permission_id,
      case when allowed then 'channel_permission' else 'do_not_distribute' end,
      extensions.digest(p.permission_id::text||p.version::text||p_operation,'sha256'),decode(repeat('00',32),'hex'));
  return jsonb_build_object('allowed',allowed,'version',p.version,'removalRequested',p.removal_requested);
end $$;

create function app_public.promotion_count(p_src text,p_event text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare release_id uuid;
begin
  select r.release_id into release_id from release_private.regional_releases r where r.region_key='topeka-ks' and r.state='active';
  perform release_private.lock_rg01_release(release_id);
  perform 1 from promotion_private.capability for share;
  perform 1 from promotion_private.sources where code=p_src for share;
  if p_src is null or p_src !~ '^[a-f0-9]{32}$' or p_event is null or p_event not in ('open','details','share')
    or not (select measurement_enabled from promotion_private.capability)
    or not release_private.public_capability_enabled('promotion')
    or not exists(select 1 from promotion_private.sources where code=p_src and active) then return false; end if;
  insert into promotion_private.daily_counts(code,day,event,count)
    values(p_src,(statement_timestamp() at time zone 'UTC')::date,p_event,1)
    on conflict(code,day,event) do update set count=promotion_private.daily_counts.count+1;
  return true;
end $$;

create function app_public.promotion_retention() returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  delete from promotion_private.daily_counts where day<=(statement_timestamp() at time zone 'UTC')::date-180;
  delete from promotion_private.channel_events where created_at<=statement_timestamp()-interval '3 years';
  delete from promotion_private.channel_permissions where (not consented or actor_id is null)
    and changed_at<=statement_timestamp()-interval '3 years';
end $$;

alter function app_public.build_account_export_canonical_json(uuid,uuid) rename to build_account_export_before_promotion;
revoke all on function app_public.build_account_export_before_promotion(uuid,uuid) from public,anon,authenticated;
create function app_public.build_account_export_canonical_json(p_job_id uuid,p_claim_token uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype; canonical jsonb;
begin
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and state='building'
    and claim_token=p_claim_token and lease_expires_at>statement_timestamp();
  if not found then raise exception using errcode='42501',message='account_export_claim_invalid'; end if;
  canonical:=app_public.build_account_export_before_promotion(p_job_id,p_claim_token)::jsonb;
  return (canonical||jsonb_build_object('promotionPermissions',(select coalesce(jsonb_agg(jsonb_build_object(
    'storeId',store_id,'channel',channel,'consented',consented,'removalRequested',removal_requested,'changedAt',changed_at)
    order by channel),'[]'::jsonb) from promotion_private.channel_permissions where actor_id=job.user_id)))::text;
end $$;
alter function app_public.build_account_export_canonical_json(uuid,uuid) owner to identity_service;
revoke all on function app_public.build_account_export_canonical_json(uuid,uuid) from public,anon,authenticated;
grant execute on function app_public.build_account_export_canonical_json(uuid,uuid) to account_lifecycle_service;

alter function app_public.promotion_channels() owner to identity_service;
alter function app_public.promotion_channel_command(text,text,bigint,boolean) owner to identity_service;
alter function app_public.promotion_count(text,text) owner to identity_service;
alter function app_public.promotion_retention() owner to identity_service;
revoke all on function app_public.promotion_channels(),app_public.promotion_channel_command(text,text,bigint,boolean),
  app_public.promotion_count(text,text),app_public.promotion_retention() from public,anon,authenticated;
grant execute on function app_public.promotion_channels(),app_public.promotion_channel_command(text,text,bigint,boolean) to authenticated;
grant execute on function app_public.promotion_count(text,text) to anon;
grant execute on function app_public.promotion_retention() to account_lifecycle_service;
revoke create on schema promotion_private,app_public from identity_service;
revoke identity_service from postgres;
