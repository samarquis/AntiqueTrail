-- D30: references are issued only by authorized record projections.
-- They are session-, version-, and record-bound; no caller-supplied target IDs.
grant create on schema admin_private, app_public to identity_service;
create table admin_private.record_audit_access (
  access_id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references app_private.active_sessions(session_id) on delete cascade,
  record_kind text not null check (record_kind in ('case','grant')),
  record_id uuid not null,
  record_version bigint not null,
  expires_at timestamptz not null default (statement_timestamp()+interval '10 minutes'),
  unique(actor_id,session_id,record_kind,record_id)
);
alter table admin_private.record_audit_access enable row level security;
alter table admin_private.record_audit_access force row level security;
revoke all on admin_private.record_audit_access from public,anon,authenticated;
grant select,insert,update,delete on admin_private.record_audit_access to identity_service;
create policy identity_record_audit_access on admin_private.record_audit_access
  for all to identity_service using(true) with check(true);

set role identity_service;
create function admin_private.issue_record_audit_access(kind text, target uuid, version bigint)
returns text language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin(); access uuid;
begin
  delete from admin_private.record_audit_access where expires_at<=statement_timestamp();
  insert into admin_private.record_audit_access(actor_id,session_id,record_kind,record_id,record_version)
    values(actor,app_private.claim_session_id(),kind,target,version)
    on conflict(actor_id,session_id,record_kind,record_id) do update
      set access_id=extensions.gen_random_uuid(),record_version=excluded.record_version,
        expires_at=excluded.expires_at
    returning access_id into access;
  return access::text;
end $$;
revoke all on function admin_private.issue_record_audit_access(text,uuid,bigint) from public,anon,authenticated;

create or replace function app_public.admin_list_store_scopes()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'grantId',g.grant_id,
      'auditAccess',admin_private.issue_record_audit_access('grant',g.grant_id,g.version),
      'subjectUserId',g.auth_user_id,
      'subjectLabel',coalesce(nullif(p.public_display_name,''),'Store representative'),
      'storeId',g.store_id,
      'storeLabel',s.name,
      'state',g.state,
      'version',g.version,
      'verifiedEmail',app_private.provider_user_is_confirmed(g.auth_user_id),
      'mfaVerified',app_private.provider_user_has_verified_mfa(g.auth_user_id),
      'grantedAt',g.granted_at,
      'revokedAt',g.revoked_at,
      'recentActivity',coalesce((select jsonb_agg(item)
        from (
          select jsonb_build_object('action',e.action,'outcome',e.outcome,'occurredAt',e.occurred_at) as item
          from app_private.privileged_audit_events e
          where e.resource_id=g.grant_id and e.occurred_at>=statement_timestamp()-interval '90 days'
          order by e.occurred_at desc,e.sequence_no desc
          limit 5
        ) activity),'[]'::jsonb))
      order by s.name,g.granted_at desc)
    from partner_private.store_partner_grants g
    join app_public.stores s on s.id=g.store_id
    left join app_private.profiles p on p.user_id=g.auth_user_id
    where g.grant_id=(select x.grant_id from partner_private.store_partner_grants x
      where x.auth_user_id=g.auth_user_id and x.store_id=g.store_id
      order by x.granted_at desc,x.grant_id desc limit 1)),'[]'::jsonb);
end $$;

create or replace function app_public.admin_get_review_case(p_case_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin(); id uuid; c admin_private.admin_review_cases%rowtype; digest bytea;
begin
  begin id:=p_case_id::uuid; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  perform admin_private.enforce_operational_admin_rate(actor,id);
  perform pg_advisory_xact_lock(hashtextextended('admin-case:'||id,0));
  select * into c from admin_private.admin_review_cases where case_id=id and state in ('open','claimed','changes_requested') for update;
  if not found or (c.assigned_admin_id is not null and c.assigned_admin_id<>actor) then raise exception using errcode='55000',message='admin_unavailable'; end if;
  if c.assigned_admin_id is null then
    update admin_private.admin_review_cases set assigned_admin_id=actor,state='claimed',version=version+1,updated_at=statement_timestamp() where case_id=id returning * into c;
    insert into admin_private.admin_case_events(case_id,actor_user_id,event_kind,from_state,to_state,snapshot_hash,idempotency_key)
      values(id,actor,'claimed','open','claimed',c.snapshot_hash,'claim-'||actor) on conflict do nothing;
    digest:=extensions.digest(convert_to('claim|'||id||'|'||actor,'utf8'),'sha256');
    perform admin_private.record_operational_admin_event('case_claimed',actor,id,digest,'completed');
  end if;
  return admin_private.review_case_json(id) || jsonb_build_object('auditAccess',admin_private.issue_record_audit_access('case',id,c.version));
end $$;

create function app_public.admin_read_record_audit(p_access text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin();
  receipt admin_private.record_audit_access%rowtype; result jsonb;
begin
  if p_access is null or p_access!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='42501',message='admin_unavailable';
  end if;
  select * into receipt from admin_private.record_audit_access
    where access_id=p_access::uuid and actor_id=actor
      and session_id=app_private.claim_session_id() and expires_at>statement_timestamp();
  if not found then raise exception using errcode='42501',message='admin_unavailable'; end if;
  perform admin_private.enforce_operational_admin_rate(actor,receipt.record_id);
  if receipt.record_kind='case' then
    perform 1 from admin_private.admin_review_cases
      where case_id=receipt.record_id and assigned_admin_id=actor
        and version=receipt.record_version and state in ('claimed','changes_requested')
      for share;
    if not found then raise exception using errcode='42501',message='admin_unavailable'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('action',e.event_kind,
      'outcome',coalesce(e.to_state,e.event_kind),'occurredAt',e.occurred_at)
      order by e.occurred_at,e.event_id),'[]'::jsonb) into result
    from (select event_kind,to_state,occurred_at,event_id
      from admin_private.admin_case_events where case_id=receipt.record_id
        and occurred_at>=statement_timestamp()-interval '2 years'
      order by occurred_at desc,event_id desc limit 100) e;
  else
    perform 1 from partner_private.store_partner_grants g
      where g.grant_id=receipt.record_id and g.version=receipt.record_version
        and g.grant_id=(select x.grant_id from partner_private.store_partner_grants x
          where x.auth_user_id=g.auth_user_id and x.store_id=g.store_id
          order by x.granted_at desc,x.grant_id desc limit 1)
      for share;
    if not found then raise exception using errcode='42501',message='admin_unavailable'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('action',e.action,
      'outcome',e.outcome,'occurredAt',e.occurred_at)
      order by e.occurred_at,e.sequence_no),'[]'::jsonb) into result
    from (select action,outcome,occurred_at,sequence_no
      from app_private.privileged_audit_events
      where resource_id=receipt.record_id and resource_kind='administrator_workspace'
        and occurred_at>=statement_timestamp()-interval '2 years'
      order by occurred_at desc,sequence_no desc limit 100) e;
  end if;
  perform admin_private.record_operational_admin_event('audit_viewed',actor,receipt.record_id,
    extensions.digest(convert_to(receipt.record_kind||'|'||receipt.record_id,'utf8'),'sha256'),'allowed');
  return result;
end $$;
revoke all on function app_public.admin_read_record_audit(text) from public,anon;
grant execute on function app_public.admin_read_record_audit(text) to authenticated;
reset role;
revoke create on schema admin_private,app_public from identity_service;
