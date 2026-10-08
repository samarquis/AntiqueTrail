-- #582: keep the existing Representative path role-scoped and add an Owner-only revoke surface.
alter table admin_private.admin_scope_actions drop constraint admin_scope_role_shape;
alter table admin_private.admin_scope_actions add constraint admin_scope_role_shape check (
  (role in ('representative','store_owner') and store_id is not null)
  or (role in ('shopper','administrator') and store_id is null));

grant create on schema app_public to identity_service;
set role identity_service;

-- Preserve the existing handlers behind role-checking wrappers. Their former
-- latest-grant selector was not role-specific and could select a Store Owner grant.
alter function app_public.admin_preview_store_scope_change(text,text,text,bigint)
  rename to admin_preview_store_scope_change_representative_base;
alter function app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)
  rename to admin_change_store_scope_representative_base;
alter function app_public.admin_decide_review_case(text,text,text,bigint,text)
  rename to admin_decide_review_case_representative_base;
revoke all on function app_public.admin_preview_store_scope_change_representative_base(text,text,text,bigint)
  from public,anon,authenticated,service_role;
revoke all on function app_public.admin_change_store_scope_representative_base(text,text,text,bigint,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function app_public.admin_decide_review_case_representative_base(text,text,text,bigint,text)
  from public,anon,authenticated,service_role;
grant execute on function app_public.admin_preview_store_scope_change_representative_base(text,text,text,bigint),
  app_public.admin_change_store_scope_representative_base(text,text,text,bigint,text,text,text),
  app_public.admin_decide_review_case_representative_base(text,text,text,bigint,text) to identity_service;

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
    where g.role='representative'
      and g.grant_id=(select x.grant_id from partner_private.store_partner_grants x
        where x.auth_user_id=g.auth_user_id and x.store_id=g.store_id and x.role='representative'
        order by x.granted_at desc,x.grant_id desc limit 1)),'[]'::jsonb);
end $$;
alter function app_public.admin_list_store_scopes() owner to identity_service;
revoke all on function app_public.admin_list_store_scopes() from public,anon;
grant execute on function app_public.admin_list_store_scopes() to authenticated;

create function app_public.admin_preview_store_scope_change(
  p_operation text,p_subject_user_id text,p_store_id text,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=admin_private.require_operational_admin();
  subject uuid; target_store uuid; representative_grant partner_private.store_partner_grants%rowtype;
begin
  begin subject:=p_subject_user_id::uuid; target_store:=p_store_id::uuid;
  exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  if p_operation not in ('revoke','regrant') or p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='admin_unavailable'; end if;
  perform admin_private.enforce_operational_admin_rate(actor,target_store);
  select * into representative_grant from partner_private.store_partner_grants g
    where g.auth_user_id=subject and g.store_id=target_store and g.role='representative'
    order by g.granted_at desc,g.grant_id desc limit 1;
  if not found or representative_grant.version<>p_expected_version
    or representative_grant.grant_id is distinct from (
      select latest.grant_id from partner_private.store_partner_grants latest
      where latest.auth_user_id=subject and latest.store_id=target_store
      order by latest.granted_at desc,latest.grant_id desc limit 1) then
    raise exception using errcode='40001',message='admin_unavailable'; end if;
  return app_public.admin_preview_store_scope_change_representative_base(
    p_operation,p_subject_user_id,p_store_id,p_expected_version);
end $$;
alter function app_public.admin_preview_store_scope_change(text,text,text,bigint) owner to identity_service;
revoke all on function app_public.admin_preview_store_scope_change(text,text,text,bigint) from public,anon;
grant execute on function app_public.admin_preview_store_scope_change(text,text,text,bigint) to authenticated;

create function app_public.admin_change_store_scope(
  p_operation text,p_subject_user_id text,p_store_id text,p_expected_version bigint,
  p_reason_code text,p_idempotency_key text,p_preview_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=admin_private.require_operational_admin();
  subject uuid; target_store uuid; selected_preview uuid;
  representative_grant partner_private.store_partner_grants%rowtype;
  prior admin_private.admin_command_receipts%rowtype; input_digest bytea;
begin
  begin
    subject:=p_subject_user_id::uuid;
    target_store:=p_store_id::uuid;
    selected_preview:=p_preview_id::uuid;
  exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  if p_operation not in ('revoke','regrant') or subject=actor or p_expected_version is null
    or p_expected_version<1 or p_reason_code is null or p_reason_code!~'^[a-z][a-z0-9_]{1,63}$'
    or p_idempotency_key is null or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='admin_unavailable'; end if;
  input_digest:=extensions.digest(convert_to(concat_ws('|',p_operation,subject,target_store,p_expected_version,p_reason_code,actor),'utf8'),'sha256');
  select * into prior from admin_private.admin_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.command_kind<>'scope_change' or prior.input_digest<>input_digest then
      raise exception using errcode='22023',message='admin_unavailable'; end if;
    return prior.result;
  end if;
  perform admin_private.enforce_operational_admin_rate(actor,target_store);
  select * into representative_grant from partner_private.store_partner_grants g
    where g.auth_user_id=subject and g.store_id=target_store and g.role='representative'
    order by g.granted_at desc,g.grant_id desc limit 1;
  if not found or representative_grant.version<>p_expected_version
    or representative_grant.grant_id is distinct from (
      select latest.grant_id from partner_private.store_partner_grants latest
      where latest.auth_user_id=subject and latest.store_id=target_store
      order by latest.granted_at desc,latest.grant_id desc limit 1) then
    raise exception using errcode='40001',message='admin_unavailable'; end if;
  return app_public.admin_change_store_scope_representative_base(
    p_operation,p_subject_user_id,p_store_id,p_expected_version,p_reason_code,p_idempotency_key,p_preview_id);
end $$;
alter function app_public.admin_change_store_scope(text,text,text,bigint,text,text,text) owner to identity_service;
revoke all on function app_public.admin_change_store_scope(text,text,text,bigint,text,text,text) from public,anon;
grant execute on function app_public.admin_change_store_scope(text,text,text,bigint,text,text,text) to authenticated;

create function app_public.admin_list_owner_access()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'claimId',c.claim_id,
      'ownerUserId',c.claimant_id,
      'storeId',c.store_id,
      'storeLabel',s.name,
      'claimState',c.state,
      'claimVersion',c.version,
      'accessState',case
        when c.state='revoked' then 'revoked'
        when c.state='approved' and exists(select 1 from partner_private.store_partner_grants g
          join partner_private.store_partnerships p on p.partnership_id=g.partnership_id
            and p.auth_user_id=c.claimant_id and p.store_id=c.store_id and p.state='active'
          join app_private.role_grants r on r.subject_user_id=c.claimant_id and r.store_id=c.store_id
            and r.role='store_owner' and r.state='active'
          where g.auth_user_id=c.claimant_id and g.store_id=c.store_id and g.role='store_owner'
            and g.state='active'
            and not exists(select 1 from partner_private.partner_access_revocations v where v.grant_id=g.grant_id))
          then 'active'
        else 'inactive' end,
      'approvedAt',a.approved_at,
      'revokedAt',c.revoked_at,
      'history',coalesce((
        select jsonb_agg(entry.item order by entry.occurred_at desc,entry.sequence_no desc)
        from (
          select jsonb_build_object('action',e.action,'outcome',e.outcome,'occurredAt',e.occurred_at) as item,
            e.occurred_at,e.sequence_no
          from app_private.privileged_audit_events e
          where e.resource_kind='listing_claim' and e.resource_id=c.claim_id
        ) entry),'[]'::jsonb)
    ) order by s.name,a.approved_at,c.claim_id)
    from partner_private.owner_claim_approvals a
    join partner_private.listing_claims c on c.claim_id=a.claim_id and c.store_id=a.store_id
    join app_public.stores s on s.id=c.store_id
    where c.state in ('approved','revoked')
  ),'[]'::jsonb);
end $$;
alter function app_public.admin_list_owner_access() owner to identity_service;
revoke all on function app_public.admin_list_owner_access() from public,anon;
grant execute on function app_public.admin_list_owner_access() to authenticated;

create function app_public.admin_preview_owner_claim_revoke(
  p_claim_id uuid,p_expected_claim_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=admin_private.require_operational_admin();
  claim partner_private.listing_claims%rowtype;
  owner_grant partner_private.store_partner_grants%rowtype;
  owner_role_grant app_private.role_grants%rowtype;
  preview admin_private.admin_scope_previews%rowtype;
  preview_hash bytea;
begin
  if p_claim_id is null or p_expected_claim_version is null or p_expected_claim_version<1 then
    raise exception using errcode='22023',message='admin_unavailable'; end if;
  select c.* into claim from partner_private.listing_claims c
    join partner_private.owner_claim_approvals a on a.claim_id=c.claim_id and a.store_id=c.store_id
    where c.claim_id=p_claim_id;
  if not found or claim.claimant_id=actor then
    raise exception using errcode='42501',message='admin_unavailable'; end if;
  perform admin_private.enforce_operational_admin_rate(actor,claim.store_id);
  if claim.version<>p_expected_claim_version then
    raise exception using errcode='40001',message='admin_unavailable'; end if;
  if claim.state<>'approved' then
    raise exception using errcode='55000',message='admin_unavailable'; end if;
  select g.* into owner_grant from partner_private.store_partner_grants g
    join partner_private.store_partnerships p on p.partnership_id=g.partnership_id
      and p.auth_user_id=claim.claimant_id and p.store_id=claim.store_id and p.state='active'
    where g.auth_user_id=claim.claimant_id and g.store_id=claim.store_id
      and g.role='store_owner' and g.state='active'
    order by g.granted_at desc,g.grant_id desc limit 1 for update of g;
  if not found then raise exception using errcode='55000',message='admin_unavailable'; end if;
  select r.* into owner_role_grant from app_private.role_grants r
    where r.subject_user_id=claim.claimant_id and r.store_id=claim.store_id
      and r.role='store_owner' and r.state='active'
    order by r.granted_at desc,r.grant_id desc limit 1 for update;
  if not found then raise exception using errcode='55000',message='admin_unavailable'; end if;
  preview_hash:=extensions.digest(convert_to(concat_ws('|','owner_claim_revoke',actor,claim.claim_id,
    claim.claimant_id,claim.store_id,claim.version,owner_grant.grant_id,owner_grant.version,
    owner_role_grant.grant_id,owner_role_grant.version),'utf8'),'sha256');
  insert into admin_private.admin_scope_previews(
    actor_user_id,subject_user_id,store_id,grant_id,grant_version,preview_hash)
  values(actor,claim.claimant_id,claim.store_id,owner_grant.grant_id,owner_grant.version,preview_hash)
  returning * into preview;
  return jsonb_build_object(
    'claimId',claim.claim_id,'ownerUserId',claim.claimant_id,'storeId',claim.store_id,
    'grantId',owner_grant.grant_id,'claimVersion',claim.version,'grantVersion',owner_grant.version,
    'previewId',preview.preview_id,'previewHash',encode(preview_hash,'hex'),'expiresAt',preview.expires_at);
end $$;
alter function app_public.admin_preview_owner_claim_revoke(uuid,bigint) owner to identity_service;
revoke all on function app_public.admin_preview_owner_claim_revoke(uuid,bigint) from public,anon;
grant execute on function app_public.admin_preview_owner_claim_revoke(uuid,bigint) to authenticated;

create function app_public.admin_revoke_owner_claim(
  p_claim_id uuid,p_expected_claim_version bigint,p_reason_code text,
  p_idempotency_key text,p_preview_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=admin_private.require_operational_admin();
  claim partner_private.listing_claims%rowtype;
  owner_grant partner_private.store_partner_grants%rowtype;
  owner_role_grant app_private.role_grants%rowtype;
  root partner_private.store_owner_intake_roots%rowtype;
  preview admin_private.admin_scope_previews%rowtype;
  prior admin_private.admin_command_receipts%rowtype;
  input_digest bytea;
  claim_digest bytea;
  expected_preview_hash bytea;
  result jsonb;
  prior_state text;
begin
  if p_claim_id is null or p_expected_claim_version is null or p_expected_claim_version<1
    or p_reason_code is null or p_reason_code!~'^[a-z][a-z0-9_]{1,63}$'
    or p_idempotency_key is null or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_preview_id is null then
    raise exception using errcode='22023',message='admin_unavailable'; end if;
  input_digest:=extensions.digest(convert_to(concat_ws('|','owner_claim_revoke',p_claim_id,
    p_expected_claim_version,p_reason_code,actor,p_preview_id),'utf8'),'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-owner-revoke:'||p_idempotency_key,0));
  select * into prior from admin_private.admin_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.command_kind<>'owner_claim_revoke'
      or prior.resource_id<>p_claim_id or prior.input_digest<>input_digest then
      raise exception using errcode='22023',message='admin_unavailable'; end if;
    return prior.result;
  end if;

  select c.* into claim from partner_private.listing_claims c
    join partner_private.owner_claim_approvals a on a.claim_id=c.claim_id and a.store_id=c.store_id
    where c.claim_id=p_claim_id;
  if not found or claim.claimant_id=actor then
    raise exception using errcode='42501',message='admin_unavailable'; end if;
  perform admin_private.enforce_operational_admin_rate(actor,claim.store_id);
  insert into partner_private.store_owner_intake_roots(applicant_id) values(claim.claimant_id)
    on conflict(applicant_id) do nothing;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=claim.claimant_id for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||claim.store_id,0));
  select c.* into claim from partner_private.listing_claims c
    join partner_private.owner_claim_approvals a on a.claim_id=c.claim_id and a.store_id=c.store_id
    where c.claim_id=p_claim_id for update of c;
  if not found then raise exception using errcode='42501',message='admin_unavailable'; end if;
  if claim.version<>p_expected_claim_version then
    raise exception using errcode='40001',message='admin_unavailable'; end if;
  if claim.state<>'approved' then
    raise exception using errcode='55000',message='admin_unavailable'; end if;
  perform 1 from partner_private.store_partner_grants where store_id=claim.store_id for update;
  select g.* into owner_grant from partner_private.store_partner_grants g
    join partner_private.store_partnerships p on p.partnership_id=g.partnership_id
      and p.auth_user_id=claim.claimant_id and p.store_id=claim.store_id and p.state='active'
    where g.auth_user_id=claim.claimant_id and g.store_id=claim.store_id
      and g.role='store_owner' and g.state='active'
    order by g.granted_at desc,g.grant_id desc limit 1 for update of g;
  if not found then raise exception using errcode='55000',message='admin_unavailable'; end if;
  select r.* into owner_role_grant from app_private.role_grants r
    where r.subject_user_id=claim.claimant_id and r.store_id=claim.store_id
      and r.role='store_owner' and r.state='active'
    order by r.granted_at desc,r.grant_id desc limit 1 for update;
  if not found then raise exception using errcode='55000',message='admin_unavailable'; end if;
  if exists(select 1 from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key) then
    raise exception using errcode='22023',message='admin_unavailable'; end if;
  select * into preview from admin_private.admin_scope_previews
    where preview_id=p_preview_id for update;
  if not found or preview.actor_user_id<>actor or preview.subject_user_id<>claim.claimant_id
    or preview.store_id<>claim.store_id or preview.grant_id<>owner_grant.grant_id
    or preview.expires_at<=statement_timestamp() or preview.consumed_at is not null then
    raise exception using errcode='42501',message='admin_unavailable'; end if;
  if preview.grant_version<>owner_grant.version then
    raise exception using errcode='40001',message='admin_unavailable'; end if;
  expected_preview_hash:=extensions.digest(convert_to(concat_ws('|','owner_claim_revoke',actor,claim.claim_id,
    claim.claimant_id,claim.store_id,claim.version,owner_grant.grant_id,owner_grant.version,
    owner_role_grant.grant_id,owner_role_grant.version),'utf8'),'sha256');
  if preview.preview_hash<>expected_preview_hash then
    raise exception using errcode='40001',message='admin_unavailable'; end if;

  prior_state:=claim.state;
  claim_digest:=extensions.digest(convert_to(concat_ws('|','revoke',claim.claim_id,
    p_expected_claim_version,p_idempotency_key,p_reason_code,null,actor),'utf8'),'sha256');
  perform partner_private.revoke_exact_claim_scope(claim.claim_id,actor,p_reason_code,p_idempotency_key||'-scope');
  select c.* into claim from partner_private.listing_claims c where c.claim_id=claim.claim_id;
  update admin_private.admin_scope_previews set consumed_at=statement_timestamp() where preview_id=p_preview_id;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key)
    values(claim.claim_id,actor,'revoked',prior_state,claim.state,p_idempotency_key);
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state)
    values(p_idempotency_key,'revoke',claim.claim_id,actor,claim_digest,claim.state);
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,'administrator','partner_claim_revoke','completed','listing_claim',claim.claim_id,p_reason_code,claim_digest,decode(repeat('00',32),'hex'));
  insert into admin_private.admin_scope_actions(
    grant_id,subject_user_id,role,store_id,action,expected_grant_version,scope_preview_hash,
    reason_code,recent_auth_at,mfa_verified_at,decided_by,outcome,idempotency_key)
  values(owner_role_grant.grant_id,claim.claimant_id,'store_owner',claim.store_id,'revoke',
    owner_role_grant.version,preview.preview_hash,p_reason_code,statement_timestamp(),statement_timestamp(),actor,'completed',p_idempotency_key);
  result:=jsonb_build_object('claimId',claim.claim_id,'claimState',claim.state,
    'claimVersion',claim.version,'accessState','revoked','revokedAt',claim.revoked_at,
    'history',coalesce((select jsonb_agg(entry.item order by entry.occurred_at desc,entry.sequence_no desc)
      from (select jsonb_build_object('action',e.action,'outcome',e.outcome,'occurredAt',e.occurred_at) as item,
        e.occurred_at,e.sequence_no from app_private.privileged_audit_events e
        where e.resource_kind='listing_claim' and e.resource_id=claim.claim_id) entry),'[]'::jsonb));
  insert into admin_private.admin_command_receipts(idempotency_key,actor_user_id,command_kind,resource_id,input_digest,result)
    values(p_idempotency_key,actor,'owner_claim_revoke',claim.claim_id,input_digest,result);
  perform admin_private.record_operational_admin_event('owner_claim_revoke',actor,claim.claim_id,input_digest,'completed');
  return result;
end $$;
alter function app_public.admin_revoke_owner_claim(uuid,bigint,text,text,uuid) owner to identity_service;
revoke all on function app_public.admin_revoke_owner_claim(uuid,bigint,text,text,uuid) from public,anon;
grant execute on function app_public.admin_revoke_owner_claim(uuid,bigint,text,text,uuid) to authenticated;

create function app_public.admin_decide_review_case(
  p_case_id text,p_action text,p_reason text,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=admin_private.require_operational_admin();
  id uuid;
  review_case admin_private.admin_review_cases%rowtype;
  claim partner_private.listing_claims%rowtype;
  root partner_private.store_owner_intake_roots%rowtype;
  prior admin_private.admin_command_receipts%rowtype;
  input_digest bytea;
  owner_intent boolean:=false;
  owner_eligible boolean:=false;
  prior_state text;
  result jsonb;
begin
  begin id:=p_case_id::uuid;
  exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  perform admin_private.enforce_operational_admin_rate(actor,id);
  if p_action is null or p_action not in ('approve','return','reject') or p_reason is null or p_reason<>btrim(p_reason)
    or char_length(p_reason) not between 1 and 1000 or p_reason~'[[:cntrl:]]'
    or p_expected_version is null or p_expected_version<1
    or p_idempotency_key is null or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='admin_unavailable'; end if;
  input_digest:=extensions.digest(convert_to(concat_ws('|',id,p_action,p_reason,p_expected_version,actor),'utf8'),'sha256');
  select * into prior from admin_private.admin_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.command_kind<>'review_decision'
      or prior.resource_id<>id or prior.input_digest<>input_digest then
      raise exception using errcode='22023',message='admin_unavailable'; end if;
    return prior.result;
  end if;
  if p_action<>'approve' then
    return app_public.admin_decide_review_case_representative_base(
      p_case_id,p_action,p_reason,p_expected_version,p_idempotency_key);
  end if;
  select * into review_case from admin_private.admin_review_cases where case_id=id;
  if not found or review_case.case_type<>'listing_claim' then
    return app_public.admin_decide_review_case_representative_base(
      p_case_id,p_action,p_reason,p_expected_version,p_idempotency_key);
  end if;
  select * into claim from partner_private.listing_claims
    where claim_id=review_case.target_id and store_id=review_case.store_id;
  if not found then
    return app_public.admin_decide_review_case_representative_base(
      p_case_id,p_action,p_reason,p_expected_version,p_idempotency_key);
  end if;
  select exists(
    select 1 from partner_private.store_owner_intake_roots root_row
      join partner_private.pending_partner_identities pending on pending.auth_user_id=claim.claimant_id
      join partner_private.partner_invitations invitation on invitation.invitation_id=pending.invitation_id
    where root_row.applicant_id=claim.claimant_id and root_row.active_kind='claim'
      and root_row.active_id=claim.claim_id and invitation.synthetic)
  into owner_intent;
  if not owner_intent then
    return app_public.admin_decide_review_case_representative_base(
      p_case_id,p_action,p_reason,p_expected_version,p_idempotency_key);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-case:'||id,0));
  select * into review_case from admin_private.admin_review_cases where case_id=id for update;
  if not found or review_case.assigned_admin_id<>actor
    or review_case.state not in ('claimed','changes_requested')
    or review_case.version<>p_expected_version then
    raise exception using errcode='40001',message='admin_unavailable'; end if;
  select * into claim from partner_private.listing_claims
    where claim_id=review_case.target_id and store_id=review_case.store_id;
  if not found or claim.claimant_id=actor then
    raise exception using errcode='42501',message='admin_unavailable'; end if;

  owner_eligible:=
    exists(select 1 from app_private.profiles p where p.user_id=claim.claimant_id
      and p.status='active' and p.verified_email_snapshot is not null)
    and app_private.provider_user_is_confirmed(claim.claimant_id)
    and app_private.provider_user_has_verified_mfa(claim.claimant_id)
    and exists(select 1 from partner_private.store_owner_intake_roots root_row
      join partner_private.pending_partner_identities pending on pending.auth_user_id=claim.claimant_id
      join partner_private.partner_invitations invitation on invitation.invitation_id=pending.invitation_id
      where root_row.applicant_id=claim.claimant_id and root_row.active_kind='claim'
        and root_row.active_id=claim.claim_id and pending.state='bound'
        and pending.verified_email_at is not null and pending.mfa_verified_at is not null
        and invitation.synthetic)
    and exists(select 1 from app_public.stores s cross join app_private.environment_stage stage
      where s.id=claim.store_id and s.synthetic and s.audience='synthetic'
        and stage.id=1 and stage.stage='synthetic_alpha');
  if owner_eligible is not true then
    raise exception using errcode='42501',message='admin_unavailable'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-approval:'||p_idempotency_key,0));
  select * into root from partner_private.store_owner_intake_roots
    where applicant_id=claim.claimant_id for update;
  if not found or root.active_kind<>'claim' or root.active_id<>claim.claim_id then
    raise exception using errcode='40001',message='admin_unavailable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||claim.store_id,0));
  select * into claim from partner_private.listing_claims
    where claim_id=review_case.target_id and store_id=review_case.store_id for update;
  if not found or claim.claimant_id=actor then
    raise exception using errcode='42501',message='admin_unavailable'; end if;
  perform app_public.owner_admin_approve_claim(claim.claim_id,claim.store_id,claim.version,p_idempotency_key);
  prior_state:=review_case.state;
  update admin_private.admin_review_cases set state='approved',version=version+1,updated_at=statement_timestamp(),
    lock_owner_id=null,lock_acquired_at=null,lock_expires_at=null
    where case_id=id returning * into review_case;
  insert into admin_private.admin_case_events(case_id,actor_user_id,event_kind,from_state,to_state,reason_code,snapshot_hash,idempotency_key)
    values(id,actor,'approved',prior_state,'approved','administrator_decision',review_case.snapshot_hash,p_idempotency_key);
  result:=jsonb_build_object('id',id,'state','approved','version',review_case.version);
  insert into admin_private.admin_command_receipts(idempotency_key,actor_user_id,command_kind,resource_id,input_digest,result)
    values(p_idempotency_key,actor,'review_decision',id,input_digest,result);
  perform admin_private.record_operational_admin_event('review_approve',actor,id,input_digest,'completed');
  return result;
end $$;
alter function app_public.admin_decide_review_case(text,text,text,bigint,text) owner to identity_service;
revoke all on function app_public.admin_decide_review_case(text,text,text,bigint,text) from public,anon;
grant execute on function app_public.admin_decide_review_case(text,text,text,bigint,text) to authenticated;

reset role;
revoke create on schema app_public from identity_service;
