-- #424 follow-up: preserve the approved Site Admin revocation authority and
-- discard recipient email HMACs as soon as an invitation is no longer pending.
begin;

alter table app_private.privileged_audit_events
  add column reason_text text,
  add constraint audit_reason_text_safe check (
    reason_text is null or (char_length(btrim(reason_text)) between 1 and 240 and reason_text !~ '[[:cntrl:]]')
  );
create or replace function app_private.hash_privileged_audit_event()
returns trigger language plpgsql set search_path = pg_catalog, app_private as $$
declare last_hash bytea;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('app_private.privileged_audit_events', 0));
  select event_hash into last_hash from app_private.privileged_audit_events order by sequence_no desc limit 1;
  new.previous_hash := last_hash;
  new.event_hash := extensions.digest(
    concat_ws('|', new.sequence_no::text, new.event_id::text, coalesce(new.actor_user_id::text,''),
      coalesce(new.subject_user_id::text,''), coalesce(new.session_id::text,''),
      coalesce(new.actor_role::text,''), new.action, new.outcome, new.resource_kind,
      coalesce(new.resource_id::text,''), coalesce(new.reason_code,''),
      coalesce(encode(new.payload_hash,'hex'),''), coalesce(encode(new.previous_hash,'hex'),''),
      new.occurred_at::text, new.retention_until::text) ||
      case when new.reason_text is null then '' else '|' || encode(
        extensions.digest(convert_to(new.reason_text,'utf8'),'sha256'),'hex') end,
    'sha256'
  );
  return new;
end; $$;

grant usage,create on schema app_public,partner_private,portal_private to identity_service;

alter table partner_private.store_team_invitations
  alter column recipient_email_hmac drop not null;
update partner_private.store_team_invitations
  set recipient_email_hmac=null where state<>'pending';
alter table partner_private.store_team_invitations
  drop constraint store_team_invitation_email_hmac_size;
alter table partner_private.store_team_invitations
  add constraint store_team_invitation_email_hmac_shape check (
    (state='pending' and recipient_email_hmac is not null and octet_length(recipient_email_hmac)=32)
    or (state<>'pending' and recipient_email_hmac is null)
  );
create index store_team_invitation_expiry_idx
  on partner_private.store_team_invitations(expires_at) where state='pending';

create or replace function partner_private.scrub_terminal_store_team_invitation_hmac()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state<>'pending' then new.recipient_email_hmac:=null; end if;
  return new;
end $$;
alter function partner_private.scrub_terminal_store_team_invitation_hmac() owner to identity_service;
create trigger scrub_terminal_store_team_invitation_hmac
  before insert or update of state on partner_private.store_team_invitations
  for each row execute function partner_private.scrub_terminal_store_team_invitation_hmac();
revoke all on function partner_private.scrub_terminal_store_team_invitation_hmac()
  from public,anon,authenticated,service_role;

alter table partner_private.store_team_command_receipts
  drop constraint store_team_command_receipts_operation_check;
alter table partner_private.store_team_command_receipts
  add constraint store_team_command_receipts_operation_check
  check(operation in ('cancel','revoke','accept','admin_revoke'));

create or replace function portal_private.purge_expired_store_team_invitations(
  p_now timestamptz,
  p_limit integer
) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare expired integer;
begin
  if p_now is null or p_limit not between 1 and 100 then
    raise exception using errcode='22023',message='owner_team_retention_input_invalid';
  end if;
  with due as (
    select invitation_id from partner_private.store_team_invitations
    where state='pending' and expires_at<=p_now
    order by expires_at,invitation_id for update skip locked limit p_limit
  )
  update partner_private.store_team_invitations i
    set state='expired',version=version+1 from due where i.invitation_id=due.invitation_id;
  get diagnostics expired=row_count;
  return expired;
end $$;
alter function portal_private.purge_expired_store_team_invitations(timestamptz,integer)
  owner to identity_service;
revoke all on function portal_private.purge_expired_store_team_invitations(timestamptz,integer)
  from public,anon,authenticated,service_role;

create or replace function app_public.partner_admin_claim_case(p_claim_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claim_admin(); c partner_private.listing_claims%rowtype;
begin
  select * into c from partner_private.listing_claims
    where claim_id=p_claim_id and (assigned_admin_id is null or assigned_admin_id=actor);
  if not found then raise exception using errcode='55000',message='partner_claim_case_unavailable'; end if;
  return jsonb_build_object(
    'claimId',c.claim_id,'storeId',c.store_id,'state',c.state,'riskTier',c.risk_tier,
    'version',c.version,'exactStoreScope',(select slug from app_public.stores where id=c.store_id),
    'verifiedSignals',(select coalesce(jsonb_agg(jsonb_build_object(
      'channelClass',channel_class,'signalType',signal_type) order by created_at),'[]')
      from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified'),
    'pendingSignals',(select coalesce(jsonb_agg(jsonb_build_object(
      'signalId',signal_id,'channelClass',channel_class,'signalType',signal_type) order by created_at),'[]')
      from partner_private.claim_authority_signals where claim_id=c.claim_id and status='submitted')
  );
end $$;
alter function app_public.partner_admin_claim_case(uuid) owner to identity_service;

create function app_public.owner_admin_team_list(p_store_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claim_admin(); members jsonb;
begin
  if p_store_id is null or not exists(
    select 1 from app_public.stores s cross join app_private.environment_stage e
    where s.id=p_store_id and s.synthetic and s.audience='synthetic'
      and e.id=1 and e.stage='synthetic_alpha'
  ) then
    perform portal_private.log_owner_team_denial('admin_team_list',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'grantId',g.grant_id,'role',g.role::text,
    'displayName',coalesce(nullif(btrim(p.public_display_name),''),'A store teammate'),
    'version',g.version
  ) order by p.public_display_name,g.grant_id),'[]'::jsonb)
  into members
  from app_private.role_grants g
  left join app_private.profiles p on p.user_id=g.subject_user_id
  where g.store_id=p_store_id and g.state='active'
    and g.role in ('co_owner','full_store_access','listing_editor');
  return jsonb_build_object('members',members);
exception when insufficient_privilege then
  perform portal_private.log_owner_team_denial('admin_team_list',p_store_id);
  raise exception using errcode='42501',message='owner_team_unavailable';
end $$;

create function app_public.owner_admin_team_revoke(
  p_store_id uuid,
  p_grant_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claim_admin();
  access app_private.role_grants%rowtype;
  prior partner_private.store_team_command_receipts%rowtype;
  input_hash bytea; result jsonb; reason text;
begin
  reason:=btrim(p_reason);
  if p_store_id is null or p_grant_id is null or p_expected_version is null or p_expected_version<1
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or reason is null or char_length(reason) not between 1 and 240 or p_reason ~ '[[:cntrl:]]' then
    raise exception using errcode='22023',message='owner_team_input_invalid';
  end if;
  if not exists(
    select 1 from app_public.stores s cross join app_private.environment_stage e
    where s.id=p_store_id and s.synthetic and s.audience='synthetic'
      and e.id=1 and e.stage='synthetic_alpha'
  ) then
    perform portal_private.log_owner_team_denial('admin_team_revoke_scope',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-team-key:'||p_idempotency_key,0)
  );
  input_hash:=extensions.digest(convert_to(
    'admin_revoke|'||p_store_id::text||'|'||p_grant_id::text||'|'||p_expected_version::text||'|'||reason,'utf8'
  ),'sha256');
  select * into prior from partner_private.store_team_command_receipts r
    where r.idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>'admin_revoke' or prior.store_id<>p_store_id
      or prior.resource_id<>p_grant_id or prior.expected_version<>p_expected_version
      or prior.input_digest<>input_hash then
      perform portal_private.log_owner_team_denial('admin_team_revoke_replay',p_store_id);
      raise exception using errcode='22023',message='owner_team_idempotency_mismatch';
    end if;
    return prior.result;
  end if;
  select * into access from app_private.role_grants g
    where g.grant_id=p_grant_id and g.store_id=p_store_id
      and g.role in ('co_owner','full_store_access','listing_editor') for update;
  if not found then
    perform portal_private.log_owner_team_denial('admin_team_revoke_scope',p_store_id);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  if access.state<>'active' or access.version<>p_expected_version then
    perform portal_private.log_owner_team_denial('admin_team_revoke_stale',p_store_id);
    raise exception using errcode='22023',message='owner_team_stale_grant';
  end if;
  update app_private.role_grants set state='revoked',revoked_by=actor,
    revoked_at=statement_timestamp(),revocation_reason=reason,version=version+1
    where grant_id=p_grant_id returning * into access;
  result:=jsonb_build_object('state','revoked','version',access.version);
  insert into partner_private.store_team_command_receipts(
    idempotency_key,actor_user_id,operation,store_id,resource_id,expected_version,input_digest,result
  ) values(p_idempotency_key,actor,'admin_revoke',p_store_id,p_grant_id,p_expected_version,input_hash,result);
  insert into app_private.privileged_audit_events(
    actor_user_id,subject_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,
    reason_text,payload_hash,event_hash
  ) values(actor,access.subject_user_id,'administrator','owner_team_access_revoked','revoked',
    'team_access',p_grant_id,'site_admin_removed',reason,
    extensions.digest(convert_to(p_store_id::text,'utf8'),'sha256'),decode(repeat('00',32),'hex'));
  return result;
exception when insufficient_privilege then
  perform portal_private.log_owner_team_denial('admin_team_revoke',p_store_id);
  raise exception using errcode='42501',message='owner_team_unavailable';
end $$;

create or replace function app_public.owner_team_accept(p_invitation_id uuid,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); invitation partner_private.store_team_invitations%rowtype;
  created_grant_id uuid; prior partner_private.store_team_command_receipts%rowtype; input_hash bytea; result jsonb;
begin
  if actor is null or p_invitation_id is null or p_expected_version is null or p_expected_version<1
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '10 minutes')
    or not app_private.privileged_anchor_is_current() or not app_private.provider_user_is_confirmed(actor)
    or not exists(select 1 from app_private.profiles p where p.user_id=actor and p.status='active'
      and p.verified_email_snapshot is not null)
    or not app_private.provider_user_has_verified_mfa(actor) then
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  select * into invitation from partner_private.store_team_invitations i
    where i.invitation_id=p_invitation_id for update;
  if not found then
    perform portal_private.log_owner_team_denial('team_accept_identity',null);
    raise exception using errcode='42501',message='owner_team_unavailable';
  end if;
  input_hash:=extensions.digest(convert_to(
    'accept|'||invitation.store_id::text||'|'||p_invitation_id::text||'|'||p_expected_version::text,'utf8'
  ),'sha256');
  select * into prior from partner_private.store_team_command_receipts r
    where r.idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>'accept' or prior.store_id<>invitation.store_id
      or prior.resource_id<>p_invitation_id or prior.expected_version<>p_expected_version
      or prior.input_digest<>input_hash then
      perform portal_private.log_owner_team_denial('team_accept_replay',invitation.store_id);
      raise exception using errcode='22023',message='owner_team_idempotency_mismatch';
    end if;
    return prior.result;
  end if;
  if invitation.state='accepted' and invitation.accepted_user_id=actor
    and invitation.version=p_expected_version+1
    and exists(select 1 from app_private.role_grants g
      where g.grant_id=invitation.grant_id and g.subject_user_id=actor and g.state='active') then
    return jsonb_build_object('storeId',invitation.store_id,'role',invitation.invited_role::text,'state','accepted');
  end if;
  if invitation.state<>'pending' or invitation.expires_at<=statement_timestamp()
    or invitation.version<>p_expected_version or invitation.recipient_email_hmac is null
    or invitation.recipient_email_hmac<>trip_private.current_verified_email_hmac(
      'store_team_invitation','shared_alpha',invitation.email_hmac_key_version)
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
  insert into partner_private.store_team_command_receipts(
    idempotency_key,actor_user_id,operation,store_id,resource_id,expected_version,input_digest,result
  ) values(p_idempotency_key,actor,'accept',invitation.store_id,p_invitation_id,p_expected_version,input_hash,result);
  insert into app_private.privileged_audit_events(
    actor_user_id,subject_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash
  ) values(actor,actor,'shopper','owner_team_invitation_accepted','completed','team_invitation',
    p_invitation_id,'team_access_accepted',
    extensions.digest(convert_to(invitation.store_id::text||'|'||invitation.invited_role::text,'utf8'),'sha256'),
    decode(repeat('00',32),'hex'));
  return result;
exception when unique_violation then
  perform portal_private.log_owner_team_denial('team_accept_duplicate',null);
  raise exception using errcode='42501',message='owner_team_unavailable';
when insufficient_privilege then
  perform portal_private.log_owner_team_denial('team_accept',null);
  raise;
end $$;

alter function app_public.owner_admin_team_list(uuid) owner to identity_service;
alter function app_public.owner_admin_team_revoke(uuid,uuid,bigint,text,text) owner to identity_service;
alter function app_public.owner_team_accept(uuid,bigint,text) owner to identity_service;
revoke all on function app_public.owner_admin_team_list(uuid),
  app_public.owner_admin_team_revoke(uuid,uuid,bigint,text,text)
  from public,anon,service_role;
grant execute on function app_public.owner_admin_team_list(uuid),
  app_public.owner_admin_team_revoke(uuid,uuid,bigint,text,text) to authenticated;

grant review_automation to postgres;
grant create on schema app_public to review_automation;
grant usage on schema portal_private to review_automation;
grant execute on function portal_private.purge_expired_store_team_invitations(timestamptz,integer)
  to review_automation;
set role review_automation;
create or replace function app_public.run_due_review_lifecycle(p_now timestamptz,p_limit integer default 100)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare finalized integer; restrictions integer; review_appeals integer; restriction_appeals integer;
  capabilities jsonb; team_invitations_expired integer;
begin
  if p_now is null or p_limit not between 1 and 100 then
    raise exception using errcode='22023',message='review_lifecycle_input_invalid';
  end if;
  finalized:=review_private.finalize_review_deletions(p_now,p_limit);
  with due as (
    select restriction_id from review_private.review_restrictions
    where state='active' and expires_at is not null and expires_at<=p_now
    order by expires_at for update skip locked limit p_limit
  ) update review_private.review_restrictions r
    set state='expired',ended_at=p_now,version=version+1 from due where r.restriction_id=due.restriction_id;
  get diagnostics restrictions=row_count;
  with due as (
    select appeal_id from review_private.review_appeals
    where state in ('submitted','assigned') and deadline_at<=p_now
    order by deadline_at for update skip locked limit p_limit
  ) update review_private.review_appeals a set state='expired',decided_at=p_now
    from due where a.appeal_id=due.appeal_id;
  get diagnostics review_appeals=row_count;
  with due as (
    select appeal_id from review_private.restriction_appeals
    where state in ('submitted','assigned') and deadline_at<=p_now
    order by deadline_at for update skip locked limit p_limit
  ) update review_private.restriction_appeals a set state='expired',decided_at=p_now
    from due where a.appeal_id=due.appeal_id;
  get diagnostics restriction_appeals=row_count;
  capabilities:=review_private.purge_reviewer_management_capabilities(p_now,p_limit);
  team_invitations_expired:=portal_private.purge_expired_store_team_invitations(p_now,p_limit);
  if finalized+restrictions+review_appeals+restriction_appeals
    +coalesce((capabilities->>'expired')::integer,0)+coalesce((capabilities->>'purged')::integer,0)
    +team_invitations_expired>0 then
    perform review_private.append_audit('review_lifecycle_sweep',null,null,null,'expired',jsonb_build_object(
      'reviewsFinalized',finalized,'restrictionsExpired',restrictions,
      'appealsExpired',review_appeals+restriction_appeals,
      'capabilitiesExpired',capabilities->'expired','capabilitiesPurged',capabilities->'purged',
      'teamInvitationsExpired',team_invitations_expired
    ));
  end if;
  return jsonb_build_object(
    'reviewsFinalized',finalized,'restrictionsExpired',restrictions,
    'appealsExpired',review_appeals+restriction_appeals,
    'capabilitiesExpired',capabilities->'expired','capabilitiesPurged',capabilities->'purged',
    'teamInvitationsExpired',team_invitations_expired
  );
end $$;
alter function app_public.run_due_review_lifecycle(timestamptz,integer) owner to review_automation;
revoke all on function app_public.run_due_review_lifecycle(timestamptz,integer)
  from public,anon,authenticated;
grant execute on function app_public.run_due_review_lifecycle(timestamptz,integer)
  to account_lifecycle_service;
reset role;
revoke create on schema app_public from review_automation;
revoke review_automation from postgres;
revoke create on schema app_public,partner_private,portal_private from identity_service;
commit;
