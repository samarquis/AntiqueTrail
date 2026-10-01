-- Team access stays inside the synthetic Owner workflow. Addresses are keyed
-- and discarded; only matching invitees can discover and accept an invitation.

alter table app_private.role_grants drop constraint role_grants_store_scope;
alter table app_private.role_grants add constraint role_grants_store_scope check (
  (role in ('shopper','administrator') and store_id is null)
  or (role in ('representative','store_owner','co_owner','full_store_access','listing_editor') and store_id is not null)
);
create index role_grants_team_scope_idx on app_private.role_grants(store_id,state)
  where role in ('store_owner','co_owner','full_store_access','listing_editor');

alter table trip_private.email_hmac_keys drop constraint email_hmac_keys_purpose_check;
alter table trip_private.email_hmac_keys add constraint email_hmac_keys_purpose_check
  check (purpose in ('trip_invitation','store_team_invitation'));

grant identity_service to postgres;
grant usage,create on schema app_private,app_public,partner_private,portal_private,trip_private to identity_service;
grant execute on function trip_private.email_hmac(text,text,text,integer),
  trip_private.current_verified_email_hmac(text,text,integer) to identity_service;

create table partner_private.store_team_invitations (
  invitation_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id) on delete restrict,
  invited_by uuid not null references auth.users(id) on delete restrict,
  recipient_email_hmac bytea not null,
  email_hmac_key_version integer not null check(email_hmac_key_version>0),
  invited_role app_private.app_role not null check(invited_role in ('co_owner','full_store_access','listing_editor')),
  state text not null default 'pending' check(state in ('pending','accepted','cancelled','expired')),
  expires_at timestamptz not null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  grant_id uuid unique references app_private.role_grants(grant_id) on delete restrict,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  idempotency_key text not null unique,
  input_digest bytea not null check(octet_length(input_digest)=32),
  version bigint not null default 1 check(version>0),
  created_at timestamptz not null default statement_timestamp(),
  constraint store_team_invitation_email_hmac_size check(octet_length(recipient_email_hmac)=32),
  constraint store_team_invitation_expiry_bound check(expires_at<=created_at+interval '7 days'),
  constraint store_team_invitation_idempotency_safe check(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint store_team_invitation_closed_shape check(
    (state='pending' and accepted_user_id is null and accepted_at is null and grant_id is null and cancelled_by is null and cancelled_at is null)
    or (state='accepted' and accepted_user_id is not null and accepted_at is not null and grant_id is not null and cancelled_by is null and cancelled_at is null)
    or (state='cancelled' and accepted_user_id is null and accepted_at is null and grant_id is null and cancelled_by is not null and cancelled_at is not null)
    or (state='expired' and accepted_user_id is null and accepted_at is null and grant_id is null and cancelled_by is null and cancelled_at is null)
  )
);
create unique index store_team_one_pending_invite on partner_private.store_team_invitations(store_id,recipient_email_hmac)
  where state='pending';
create index store_team_invitee_lookup on partner_private.store_team_invitations(recipient_email_hmac,email_hmac_key_version)
  where state='pending';
alter table partner_private.store_team_invitations enable row level security;
alter table partner_private.store_team_invitations force row level security;
revoke all on partner_private.store_team_invitations from public,anon,authenticated,service_role;
grant select,insert,update on partner_private.store_team_invitations to identity_service;
create policy identity_store_team_invitations on partner_private.store_team_invitations to identity_service
  using(true) with check(true);

create table partner_private.store_team_command_receipts (
  idempotency_key text primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check(operation in ('cancel','revoke','accept')),
  store_id uuid not null references app_public.stores(id) on delete restrict,
  resource_id uuid not null,
  expected_version bigint not null check(expected_version>0),
  input_digest bytea not null check(octet_length(input_digest)=32),
  result jsonb not null check(jsonb_typeof(result)='object'),
  created_at timestamptz not null default statement_timestamp(),
  constraint store_team_command_idempotency_safe check(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);
alter table partner_private.store_team_command_receipts enable row level security;
alter table partner_private.store_team_command_receipts force row level security;
revoke all on partner_private.store_team_command_receipts from public,anon,authenticated,service_role;
grant select,insert on partner_private.store_team_command_receipts to identity_service;
create policy identity_store_team_command_receipts on partner_private.store_team_command_receipts to identity_service
  using(true) with check(true);

grant identity_service to postgres;
set role identity_service;

create or replace function app_private.guard_privileged_role_activation()
returns trigger language plpgsql security definer set search_path='' as $$
declare privileged boolean; activating boolean;
begin
  privileged:=case tg_table_schema||'.'||tg_table_name
    when 'app_private.role_grants' then new.role in ('representative','store_owner','co_owner','full_store_access','listing_editor','administrator')
    when 'partner_private.store_partner_grants' then new.role in ('representative','store_owner')
    else false end;
  activating:=new.state='active' and (tg_op='INSERT' or old.state<>'active' or new.role is distinct from old.role);
  if privileged and activating and not app_private.privileged_anchor_is_current() then
    raise exception using errcode='42501',message='privileged_anchor_stale';
  end if;
  return new;
end $$;

create function portal_private.log_owner_team_denial(p_operation text,p_store_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  raise log 'owner_team_access_denied %',jsonb_build_object(
    'actorId',app_public.request_user_id(),'requestedStoreId',p_store_id,
    'operation',p_operation,'outcome','denied');
end $$;

create function portal_private.owner_access_roles()
returns table(store_id uuid,store_name text,store_role app_private.app_role)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id();
begin
  if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '10 minutes')
    or not app_private.privileged_anchor_is_current()
    or not app_private.provider_user_is_confirmed(actor)
    or not exists(select 1 from app_private.profiles p where p.user_id=actor and p.status='active' and p.verified_email_snapshot is not null) then
    return;
  end if;
  begin
    return query select s.store_id,s.store_name,'store_owner'::app_private.app_role from portal_private.owner_stores() s;
  exception when insufficient_privilege then null;
  end;
  return query
    select s.id,s.name,g.role
    from app_private.role_grants g
    join partner_private.store_team_invitations i on i.grant_id=g.grant_id
      and i.accepted_user_id=actor and i.state='accepted'
    join app_public.stores s on s.id=g.store_id
    cross join app_private.environment_stage e
    where g.subject_user_id=actor and g.state='active'
      and g.role in ('co_owner','full_store_access','listing_editor')
      and s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha';
end $$;

create function portal_private.owner_team_actor_role(p_store_id uuid)
returns app_private.app_role language plpgsql stable security definer set search_path='' as $$
declare actor_role app_private.app_role;
begin
  select a.store_role into actor_role from portal_private.owner_access_roles() a
    where a.store_id=p_store_id
    order by case a.store_role when 'store_owner' then 1 when 'co_owner' then 2 when 'full_store_access' then 3 else 4 end
    limit 1;
  if actor_role is null or actor_role='listing_editor' then
    perform portal_private.log_owner_team_denial('team_manage',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  return actor_role;
end $$;

create or replace function app_public.owner_list_stores() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare stores jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'storeId',s.store_id,'name',s.store_name,
    'role',case s.store_role when 'store_owner' then 'store_owner' when 'co_owner' then 'co_owner'
      when 'full_store_access' then 'full_store_access' else 'listing_editor' end
  ) order by s.store_name,s.store_id)
  into stores
  from (
    select distinct on (a.store_id) a.store_id,a.store_name,a.store_role
    from portal_private.owner_access_roles() a
    order by a.store_id,case a.store_role when 'store_owner' then 1 when 'co_owner' then 2 when 'full_store_access' then 3 else 4 end
  ) s;
  if stores is null then raise exception using errcode='42501',message='owner_access_unavailable'; end if;
  return jsonb_build_object('role','Store Owner','stores',stores);
exception when insufficient_privilege then
  perform portal_private.log_owner_access_denial('owner_list_stores',null);
  raise;
end $$;

create or replace function app_public.owner_current_role() returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if exists(select 1 from portal_private.owner_access_roles()) then return 'Store Owner'; end if;
  return null;
exception when insufficient_privilege then return null;
end $$;

create or replace function app_public.owner_select_store(p_store_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_store_id is null or not exists(select 1 from portal_private.owner_access_roles() s where s.store_id=p_store_id) then
    raise exception using errcode='42501',message='owner_access_unavailable';
  end if;
  return jsonb_build_object('storeId',p_store_id);
exception when insufficient_privilege then
  perform portal_private.log_owner_access_denial('owner_select_store',p_store_id);
  raise;
end $$;

create function app_public.owner_team_list(p_store_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); actor_role app_private.app_role; result jsonb;
begin
  actor_role:=portal_private.owner_team_actor_role(p_store_id);
  select jsonb_build_object(
    'members',coalesce((
      select jsonb_agg(jsonb_build_object('accessId',g.grant_id,'role',g.role::text,
        'displayName',coalesce(p.public_display_name,'Store teammate'),'version',g.version,
        'canRevoke',actor_role='store_owner' and g.role<>'store_owner' and g.subject_user_id<>actor)
        order by g.granted_at,g.grant_id)
      from app_private.role_grants g join app_private.profiles p on p.user_id=g.subject_user_id
      where g.store_id=p_store_id and g.state='active'
        and g.role in ('store_owner','co_owner','full_store_access','listing_editor')
    ),'[]'::jsonb),
    'invitations',coalesce((
      select jsonb_agg(jsonb_build_object('invitationId',i.invitation_id,'role',i.invited_role::text,
        'version',i.version,'canCancel',actor_role in ('store_owner','co_owner')
          or (actor_role='full_store_access' and i.invited_by=actor)) order by i.created_at,i.invitation_id)
      from partner_private.store_team_invitations i
      where i.store_id=p_store_id and i.state='pending' and i.expires_at>statement_timestamp()
    ),'[]'::jsonb)
  ) into result;
  return result;
exception when insufficient_privilege then
  perform portal_private.log_owner_team_denial('team_list',p_store_id);
  raise;
end $$;

create function app_public.owner_team_invite(p_store_id uuid,p_recipient_email text,p_role text,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); actor_role app_private.app_role;
  normalized_email text; wanted_role app_private.app_role; recipient_hash bytea; key_version integer;
  input_hash bytea; prior partner_private.store_team_invitations%rowtype; invitation partner_private.store_team_invitations%rowtype;
begin
  if p_store_id is null or p_role is null
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='owner_team_input_invalid';
  end if;
  normalized_email:=lower(btrim(coalesce(p_recipient_email,'')));
  if char_length(normalized_email) not between 3 and 320 or normalized_email~'[[:cntrl:]]'
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception using errcode='22023',message='owner_team_input_invalid';
  end if;
  actor_role:=portal_private.owner_team_actor_role(p_store_id);
  if p_role not in ('co_owner','full_store_access','listing_editor') then
    perform portal_private.log_owner_team_denial('team_invite_role',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  if not (actor_role in ('store_owner','co_owner') or (actor_role='full_store_access' and p_role='listing_editor')) then
    perform portal_private.log_owner_team_denial('team_invite',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  wanted_role:=p_role::app_private.app_role;
  select h.value,h.key_version into recipient_hash,key_version
    from trip_private.email_hmac(normalized_email,'store_team_invitation','shared_alpha',null) h;
  if recipient_hash=trip_private.current_verified_email_hmac('store_team_invitation','shared_alpha',key_version) then
    perform portal_private.log_owner_team_denial('team_self_invite',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  input_hash:=extensions.digest(convert_to(p_store_id::text||'|'||p_role||'|'||encode(recipient_hash,'hex'),'utf8'),'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-team-key:'||p_idempotency_key,0));
  select * into prior from partner_private.store_team_invitations i where i.idempotency_key=p_idempotency_key for update;
  if found then
    if prior.invited_by<>actor or prior.store_id<>p_store_id or prior.input_digest<>input_hash then
      perform portal_private.log_owner_team_denial('team_invite_replay',p_store_id);
      raise exception using errcode='22023',message='owner_team_idempotency_mismatch';
    end if;
    return jsonb_build_object('invitationId',prior.invitation_id,'state',prior.state,'version',prior.version);
  end if;
  select * into prior from partner_private.store_team_invitations i
    where i.store_id=p_store_id and i.recipient_email_hmac=recipient_hash and i.state='pending' for update;
  if found and prior.expires_at>statement_timestamp() then
    if prior.invited_role<>wanted_role then
      perform portal_private.log_owner_team_denial('team_invite_conflict',p_store_id);
      raise exception using errcode='22023',message='owner_team_invitation_pending';
    end if;
    return jsonb_build_object('invitationId',prior.invitation_id,'state',prior.state,'version',prior.version);
  elsif found then
    update partner_private.store_team_invitations set state='expired',version=version+1
      where invitation_id=prior.invitation_id;
  end if;
  insert into partner_private.store_team_invitations(
    store_id,invited_by,recipient_email_hmac,email_hmac_key_version,invited_role,expires_at,idempotency_key,input_digest
  ) values(p_store_id,actor,recipient_hash,key_version,wanted_role,statement_timestamp()+interval '7 days',p_idempotency_key,input_hash)
  returning * into invitation;
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,actor_role,'owner_team_invited','requested','team_invitation',invitation.invitation_id,'team_access_requested',
      extensions.digest(convert_to(p_store_id::text||'|'||p_role,'utf8'),'sha256'),decode(repeat('00',32),'hex'));
  return jsonb_build_object('invitationId',invitation.invitation_id,'state',invitation.state,'version',invitation.version);
exception when insufficient_privilege then
  perform portal_private.log_owner_team_denial('team_invite',p_store_id);
  raise;
end $$;

create function app_public.owner_team_cancel(p_store_id uuid,p_invitation_id uuid,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); actor_role app_private.app_role;
  invitation partner_private.store_team_invitations%rowtype; prior partner_private.store_team_command_receipts%rowtype;
  input_hash bytea; result jsonb;
begin
  if p_store_id is null or p_invitation_id is null or p_expected_version is null or p_expected_version<1
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='owner_team_input_invalid';
  end if;
  actor_role:=portal_private.owner_team_actor_role(p_store_id);
  select * into invitation from partner_private.store_team_invitations i
    where i.invitation_id=p_invitation_id and i.store_id=p_store_id for update;
  if not found or not (actor_role in ('store_owner','co_owner') or
    (actor_role='full_store_access' and invitation.invited_by=actor)) then
    perform portal_private.log_owner_team_denial('team_cancel',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  input_hash:=extensions.digest(convert_to('cancel|'||p_store_id::text||'|'||p_invitation_id::text||'|'||p_expected_version::text,'utf8'),'sha256');
  select * into prior from partner_private.store_team_command_receipts r where r.idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>'cancel' or prior.store_id<>p_store_id
      or prior.resource_id<>p_invitation_id or prior.expected_version<>p_expected_version or prior.input_digest<>input_hash then
      perform portal_private.log_owner_team_denial('team_cancel_replay',p_store_id);
      raise exception using errcode='22023',message='owner_team_idempotency_mismatch';
    end if;
    return prior.result;
  end if;
  if invitation.state<>'pending' or invitation.expires_at<=statement_timestamp() or invitation.version<>p_expected_version then
    perform portal_private.log_owner_team_denial('team_cancel_stale',p_store_id);
    raise exception using errcode='22023',message='owner_team_stale_invitation';
  end if;
  update partner_private.store_team_invitations set state='cancelled',cancelled_by=actor,
    cancelled_at=statement_timestamp(),version=version+1 where invitation_id=p_invitation_id returning * into invitation;
  result:=jsonb_build_object('state','cancelled','version',invitation.version);
  insert into partner_private.store_team_command_receipts(idempotency_key,actor_user_id,operation,store_id,resource_id,expected_version,input_digest,result)
    values(p_idempotency_key,actor,'cancel',p_store_id,p_invitation_id,p_expected_version,input_hash,result);
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,actor_role,'owner_team_invitation_cancelled','revoked','team_invitation',p_invitation_id,'team_access_cancelled',
      extensions.digest(convert_to(p_store_id::text,'utf8'),'sha256'),decode(repeat('00',32),'hex'));
  return result;
exception when insufficient_privilege then
  perform portal_private.log_owner_team_denial('team_cancel',p_store_id);
  raise;
end $$;

create function app_public.owner_team_revoke(p_store_id uuid,p_grant_id uuid,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); actor_role app_private.app_role; access app_private.role_grants%rowtype;
  prior partner_private.store_team_command_receipts%rowtype; input_hash bytea; result jsonb;
begin
  if p_store_id is null or p_grant_id is null or p_expected_version is null or p_expected_version<1
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='owner_team_input_invalid';
  end if;
  actor_role:=portal_private.owner_team_actor_role(p_store_id);
  if actor_role<>'store_owner' then
    perform portal_private.log_owner_team_denial('team_revoke_role',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  select * into access from app_private.role_grants g where g.grant_id=p_grant_id and g.store_id=p_store_id for update;
  if not found or access.subject_user_id=actor or access.role not in ('co_owner','full_store_access','listing_editor') then
    perform portal_private.log_owner_team_denial('team_revoke_scope',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  input_hash:=extensions.digest(convert_to('revoke|'||p_store_id::text||'|'||p_grant_id::text||'|'||p_expected_version::text,'utf8'),'sha256');
  select * into prior from partner_private.store_team_command_receipts r where r.idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>'revoke' or prior.store_id<>p_store_id
      or prior.resource_id<>p_grant_id or prior.expected_version<>p_expected_version or prior.input_digest<>input_hash then
      perform portal_private.log_owner_team_denial('team_revoke_replay',p_store_id);
      raise exception using errcode='22023',message='owner_team_idempotency_mismatch';
    end if;
    return prior.result;
  end if;
  if access.state<>'active' or access.version<>p_expected_version then
    perform portal_private.log_owner_team_denial('team_revoke_stale',p_store_id);
    raise exception using errcode='22023',message='owner_team_stale_grant';
  end if;
  update app_private.role_grants set state='revoked',revoked_by=actor,revoked_at=statement_timestamp(),
    revocation_reason='owner_removed',version=version+1 where grant_id=p_grant_id returning * into access;
  result:=jsonb_build_object('state','revoked','version',access.version);
  insert into partner_private.store_team_command_receipts(idempotency_key,actor_user_id,operation,store_id,resource_id,expected_version,input_digest,result)
    values(p_idempotency_key,actor,'revoke',p_store_id,p_grant_id,p_expected_version,input_hash,result);
  insert into app_private.privileged_audit_events(actor_user_id,subject_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,access.subject_user_id,actor_role,'owner_team_access_revoked','revoked','team_access',p_grant_id,'owner_removed',
      extensions.digest(convert_to(p_store_id::text,'utf8'),'sha256'),decode(repeat('00',32),'hex'));
  return result;
exception when insufficient_privilege then
  perform portal_private.log_owner_team_denial('team_revoke',p_store_id);
  raise;
end $$;

create function app_public.owner_team_invitations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); result jsonb;
begin
  if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '10 minutes')
    or not app_private.provider_user_is_confirmed(actor)
    or not exists(select 1 from app_private.profiles p where p.user_id=actor and p.status='active' and p.verified_email_snapshot is not null) then
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  select jsonb_build_object('invitations',coalesce(jsonb_agg(jsonb_build_object(
    'invitationId',i.invitation_id,'storeId',i.store_id,'storeName',s.name,
    'inviterName',coalesce(p.public_display_name,'A store teammate'),
    'role',i.invited_role::text,'version',i.version) order by i.created_at,i.invitation_id),'[]'::jsonb))
  into result
  from partner_private.store_team_invitations i
  join app_public.stores s on s.id=i.store_id
  left join app_private.profiles p on p.user_id=i.invited_by
  cross join lateral (select trip_private.current_verified_email_hmac(
    'store_team_invitation','shared_alpha',i.email_hmac_key_version) as email_hmac) recipient
  cross join app_private.environment_stage e
  where i.state='pending' and i.expires_at>statement_timestamp()
    and i.recipient_email_hmac=recipient.email_hmac
    and s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha';
  return result;
exception when insufficient_privilege then
  perform portal_private.log_owner_team_denial('team_invitations',null);
  raise;
end $$;

create function app_public.owner_team_accept(p_invitation_id uuid,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); invitation partner_private.store_team_invitations%rowtype;
  created_grant_id uuid; prior partner_private.store_team_command_receipts%rowtype; input_hash bytea; result jsonb;
begin
  if actor is null or p_invitation_id is null or p_expected_version is null or p_expected_version<1
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '10 minutes')
    or not app_private.privileged_anchor_is_current() or not app_private.provider_user_is_confirmed(actor)
    or not exists(select 1 from app_private.profiles p where p.user_id=actor and p.status='active' and p.verified_email_snapshot is not null)
    or not app_private.provider_user_has_verified_mfa(actor) then
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  select * into invitation from partner_private.store_team_invitations i where i.invitation_id=p_invitation_id for update;
  if not found or invitation.recipient_email_hmac<>trip_private.current_verified_email_hmac(
    'store_team_invitation','shared_alpha',invitation.email_hmac_key_version) then
    perform portal_private.log_owner_team_denial('team_accept_identity',null);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  input_hash:=extensions.digest(convert_to('accept|'||invitation.store_id::text||'|'||p_invitation_id::text||'|'||p_expected_version::text,'utf8'),'sha256');
  select * into prior from partner_private.store_team_command_receipts r where r.idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>'accept' or prior.store_id<>invitation.store_id
      or prior.resource_id<>p_invitation_id or prior.expected_version<>p_expected_version or prior.input_digest<>input_hash then
      perform portal_private.log_owner_team_denial('team_accept_replay',invitation.store_id);
      raise exception using errcode='22023',message='owner_team_idempotency_mismatch';
    end if;
    return prior.result;
  end if;
  if invitation.state='accepted' and invitation.accepted_user_id=actor
    and exists(select 1 from app_private.role_grants g where g.grant_id=invitation.grant_id and g.state='active') then
    return jsonb_build_object('storeId',invitation.store_id,'role',invitation.invited_role::text,'state','accepted');
  end if;
  if invitation.state<>'pending' or invitation.expires_at<=statement_timestamp() or invitation.version<>p_expected_version
    or not exists(select 1 from app_public.stores s cross join app_private.environment_stage e
      where s.id=invitation.store_id and s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha') then
    perform portal_private.log_owner_team_denial('team_accept_stale',invitation.store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by)
    values(actor,invitation.invited_role,invitation.store_id,'active',invitation.invited_by)
    returning grant_id into created_grant_id;
  update partner_private.store_team_invitations set state='accepted',accepted_user_id=actor,
    accepted_at=statement_timestamp(),grant_id=created_grant_id,version=version+1
    where invitation_id=p_invitation_id returning * into invitation;
  result:=jsonb_build_object('storeId',invitation.store_id,'role',invitation.invited_role::text,'state','accepted');
  insert into partner_private.store_team_command_receipts(idempotency_key,actor_user_id,operation,store_id,resource_id,expected_version,input_digest,result)
    values(p_idempotency_key,actor,'accept',invitation.store_id,p_invitation_id,p_expected_version,input_hash,result);
  insert into app_private.privileged_audit_events(actor_user_id,subject_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,actor,'shopper','owner_team_invitation_accepted','completed','team_invitation',p_invitation_id,'team_access_accepted',
      extensions.digest(convert_to(invitation.store_id::text||'|'||invitation.invited_role::text,'utf8'),'sha256'),decode(repeat('00',32),'hex'));
  return result;
exception when unique_violation then
  perform portal_private.log_owner_team_denial('team_accept_duplicate',null);
  raise exception using errcode='42501',message='owner_team_unavailable';
when insufficient_privilege then
  perform portal_private.log_owner_team_denial('team_accept',null);
  raise;
end $$;

create or replace function portal_private.require_portal_scope()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid; has_exactly_one_scope boolean; selected uuid;
begin
  if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '10 minutes') then
    raise exception using errcode='42501',message='portal_unavailable';
  end if;
  begin
    selected:=nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-owner-store-id','')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='42501',message='portal_unavailable';
  end;
  if selected is not null then
    begin
      if exists(select 1 from portal_private.owner_access_roles() s where s.store_id=selected) then return selected; end if;
    exception when insufficient_privilege then null;
    end;
    raise exception using errcode='42501',message='portal_unavailable';
  end if;
  if not partner_private.partner_consent_is_current(actor) then
    raise exception using errcode='42501',message='portal_unavailable';
  end if;
  select count(*)=1,(array_agg(g.store_id))[1] into has_exactly_one_scope,target
  from partner_private.store_partner_grants g
  join partner_private.store_partnerships p on p.partnership_id=g.partnership_id and p.auth_user_id=actor and p.store_id=g.store_id and p.state='active'
  join app_public.stores s on s.id=g.store_id
  cross join app_private.environment_stage e
  where g.auth_user_id=actor and g.role='representative' and g.state='active'
    and not exists(select 1 from partner_private.partner_access_revocations r where r.grant_id=g.grant_id)
    and ((s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha')
      or (not s.synthetic and s.audience='regional_readiness' and e.id=1 and e.stage='private_beta')
      or (not s.synthetic and s.audience='public' and e.id=1 and e.stage='regional_public'));
  if not coalesce(has_exactly_one_scope,false) or target is null then raise exception using errcode='42501',message='portal_unavailable'; end if;
  return target;
exception when insufficient_privilege then
  perform portal_private.log_owner_access_denial('portal_scope',selected);
  raise;
end $$;

create or replace function portal_private.require_owner_media_scope(p_store_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-owner-store-id','') is not null
    or (not app_private.current_user_has_role('administrator'::app_private.app_role)
      and exists(select 1 from app_private.role_grants g where g.subject_user_id=app_public.request_user_id()
      and g.store_id=p_store_id and g.role in ('store_owner','co_owner','full_store_access','listing_editor'))) then
    if portal_private.require_portal_scope() is distinct from p_store_id then
      raise exception using errcode='42501',message='media_unavailable';
    end if;
  end if;
exception when insufficient_privilege then
  perform portal_private.log_owner_access_denial('owner_media_scope',p_store_id);
  raise exception using errcode='42501',message='media_unavailable';
end $$;

create or replace function app_public.promotion_channels() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); owner_role app_private.app_role;
begin
  select a.store_role into owner_role from portal_private.owner_access_roles() a where a.store_id=target
    order by case a.store_role when 'store_owner' then 1 when 'co_owner' then 2 when 'full_store_access' then 3 else 4 end limit 1;
  if not exists(select 1 from partner_private.store_partner_grants g
    join partner_private.store_partnerships p on p.partnership_id=g.partnership_id and p.auth_user_id=actor and p.store_id=g.store_id and p.state='active'
    where g.auth_user_id=actor and g.store_id=target and g.role='representative' and g.scope_kind='store' and g.state='active'
      and partner_private.partner_consent_is_current(actor)
      and not exists(select 1 from partner_private.partner_access_revocations r where r.grant_id=g.grant_id))
    and (owner_role is null or owner_role not in ('store_owner','co_owner','full_store_access')) then
    raise exception using errcode='42501',message='promotion_unavailable';
  end if;
  return (select jsonb_agg(jsonb_build_object('channel',c,'consented',coalesce(p.consented and p.actor_id=actor and (
    p.grant_id=(select g.grant_id from partner_private.store_partner_grants g where g.store_id=target and g.auth_user_id=actor and g.role='representative' and g.scope_kind='store' and g.state='active')
    or (p.grant_id is null and owner_role in ('store_owner','co_owner','full_store_access'))),false),
    'version',coalesce(p.version,0),'removalRequested',coalesce(p.removal_requested,false),'distributionAllowed',false) order by c)
    from unnest(array['flyer','owner_card','co_brand','social']) c
    left join promotion_private.channel_permissions p on p.store_id=target and p.channel=c);
end $$;

create or replace function app_public.promotion_channel_command(p_channel text,p_operation text,p_version bigint,p_generic_owner_card boolean default false)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid; scope_grant uuid; owner_role app_private.app_role; audit_role app_private.app_role;
  p promotion_private.channel_permissions%rowtype; release_id uuid; allowed boolean:=false; is_admin boolean:=false;
begin
  if p_channel is null or p_channel not in ('flyer','owner_card','co_brand','social') or p_operation is null
    or p_operation not in ('consent','withdraw','distribute','reprint','post') or p_version is null or p_version<0
    or p_generic_owner_card is null then raise exception using errcode='22023',message='promotion_unavailable'; end if;
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
    audit_role:='administrator';
  else
    target:=portal_private.require_portal_scope();
    select g.grant_id into scope_grant from partner_private.store_partner_grants g
      join partner_private.store_partnerships part on part.partnership_id=g.partnership_id and part.auth_user_id=actor and part.store_id=g.store_id and part.state='active'
      where g.auth_user_id=actor and g.store_id=target and g.role='representative' and g.scope_kind='store' and g.state='active'
        and partner_private.partner_consent_is_current(actor)
        and not exists(select 1 from partner_private.partner_access_revocations r where r.grant_id=g.grant_id) for update;
    select a.store_role into owner_role from portal_private.owner_access_roles() a where a.store_id=target
      order by case a.store_role when 'store_owner' then 1 when 'co_owner' then 2 when 'full_store_access' then 3 else 4 end limit 1;
    if scope_grant is null and (owner_role is null or owner_role not in ('store_owner','co_owner','full_store_access')) then
      raise exception using errcode='42501',message='promotion_unavailable';
    end if;
    if portal_private.require_portal_scope() is distinct from target then
      raise exception using errcode='42501',message='promotion_unavailable';
    end if;
    audit_role:=coalesce(owner_role,'representative'::app_private.app_role);
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
    if allowed then
      update promotion_private.channel_permissions set version=version+1,
        consented=case when p_channel='social' then false else consented end
        where permission_id=p.permission_id returning * into p;
    end if;
  end if;
  insert into promotion_private.channel_events(permission_id,operation,allowed) values(p.permission_id,p_operation,allowed);
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,audit_role,'promotion_'||p_operation,case when allowed then 'completed' else 'denied' end,'promotion_permission',p.permission_id,
      case when allowed then 'channel_permission' else 'do_not_distribute' end,
      extensions.digest(p.permission_id::text||p.version::text||p_operation,'sha256'),decode(repeat('00',32),'hex'));
  return jsonb_build_object('allowed',allowed,'version',p.version,'removalRequested',p.removal_requested);
end $$;

reset role;

revoke all on function portal_private.owner_access_roles(),portal_private.owner_team_actor_role(uuid),
  portal_private.log_owner_team_denial(text,uuid) from public,anon,authenticated,service_role;
revoke all on function app_public.owner_list_stores(),app_public.owner_current_role(),app_public.owner_select_store(uuid),
  app_public.owner_team_list(uuid),app_public.owner_team_invite(uuid,text,text,text),
  app_public.owner_team_cancel(uuid,uuid,bigint,text),app_public.owner_team_revoke(uuid,uuid,bigint,text),
  app_public.owner_team_invitations(),app_public.owner_team_accept(uuid,bigint,text)
  from public,anon,service_role;
grant execute on function app_public.owner_list_stores(),app_public.owner_current_role(),app_public.owner_select_store(uuid),
  app_public.owner_team_list(uuid),app_public.owner_team_invite(uuid,text,text,text),
  app_public.owner_team_cancel(uuid,uuid,bigint,text),app_public.owner_team_revoke(uuid,uuid,bigint,text),
  app_public.owner_team_invitations(),app_public.owner_team_accept(uuid,bigint,text) to authenticated;
revoke all on function trip_private.email_hmac(text,text,text,integer),trip_private.current_verified_email_hmac(text,text,integer)
  from public,anon,authenticated,service_role;
revoke create on schema app_private,app_public,partner_private,portal_private,trip_private from identity_service;
revoke identity_service from postgres;
