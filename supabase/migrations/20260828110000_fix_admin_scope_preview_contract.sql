-- Issue #133: one server-issued preview binds the exact scope operation.
-- The prior three-argument preview could only represent regrant while the UI
-- required it before revoke, leaving active scopes unable to reach revocation.

drop function app_public.admin_preview_store_scope_change(text,text,bigint);

create function app_public.admin_preview_store_scope_change(
  p_operation text,
  p_subject_user_id text,
  p_store_id text,
  p_expected_version bigint
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=admin_private.require_operational_admin();
  subject uuid;
  target_store uuid;
  g partner_private.store_partner_grants%rowtype;
  preview admin_private.admin_scope_previews%rowtype;
  digest bytea;
begin
  begin
    subject:=p_subject_user_id::uuid;
    target_store:=p_store_id::uuid;
  exception when others then
    raise exception using errcode='22023',message='admin_unavailable';
  end;
  if p_operation not in ('revoke','regrant') then
    raise exception using errcode='22023',message='admin_unavailable';
  end if;
  perform admin_private.enforce_operational_admin_rate(actor,target_store);
  select * into g from partner_private.store_partner_grants
    where auth_user_id=subject and store_id=target_store
    order by granted_at desc,grant_id desc limit 1 for update;
  if not found or g.version<>p_expected_version
    or (p_operation='revoke' and g.state not in ('active','reconsent_required'))
    or (p_operation='regrant' and g.state<>'revoked') then
    raise exception using errcode='40001',message='admin_unavailable';
  end if;
  digest:=extensions.digest(
    convert_to(concat_ws('|',p_operation,subject,target_store,g.grant_id,g.version),'utf8'),
    'sha256'
  );
  insert into admin_private.admin_scope_previews(
    actor_user_id,subject_user_id,store_id,grant_id,grant_version,preview_hash
  ) values(actor,subject,target_store,g.grant_id,g.version,digest) returning * into preview;
  return jsonb_build_object(
    'previewId',preview.preview_id,
    'subjectUserId',subject,
    'storeId',target_store,
    'grantId',g.grant_id,
    'grantVersion',g.version,
    'previewHash',encode(digest,'hex'),
    'expiresAt',preview.expires_at
  );
end $$;
alter function app_public.admin_preview_store_scope_change(text,text,text,bigint) owner to identity_service;
revoke all on function app_public.admin_preview_store_scope_change(text,text,text,bigint) from public,anon;
grant execute on function app_public.admin_preview_store_scope_change(text,text,text,bigint) to authenticated;

create or replace function app_public.admin_change_store_scope(
  p_operation text,
  p_subject_user_id text,
  p_store_id text,
  p_expected_version bigint,
  p_reason_code text,
  p_idempotency_key text,
  p_preview_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=admin_private.require_operational_admin();
  subject uuid;
  target_store uuid;
  g partner_private.store_partner_grants%rowtype;
  app_grant app_private.role_grants%rowtype;
  partnership partner_private.store_partnerships%rowtype;
  prior admin_private.admin_command_receipts%rowtype;
  digest bytea;
  result jsonb;
  prior_app_grant uuid;
  preview admin_private.admin_scope_previews%rowtype;
  selected_preview_id uuid;
begin
  begin
    subject:=p_subject_user_id::uuid;
    target_store:=p_store_id::uuid;
    selected_preview_id:=p_preview_id::uuid;
  exception when others then
    raise exception using errcode='22023',message='admin_unavailable';
  end;
  if p_operation not in ('revoke','regrant') or subject=actor or p_expected_version<1
    or p_reason_code!~'^[a-z][a-z0-9_]{1,63}$'
    or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='admin_unavailable';
  end if;
  digest:=extensions.digest(
    convert_to(concat_ws('|',p_operation,subject,target_store,p_expected_version,p_reason_code,actor),'utf8'),
    'sha256'
  );
  perform admin_private.enforce_operational_admin_rate(actor,target_store);
  select * into prior from admin_private.admin_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.command_kind<>'scope_change' or prior.input_digest<>digest then
      raise exception using errcode='22023',message='admin_unavailable';
    end if;
    return prior.result;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-scope:'||subject||':'||target_store,0));
  select * into g from partner_private.store_partner_grants
    where auth_user_id=subject and store_id=target_store
    order by granted_at desc,grant_id desc limit 1 for update;
  if not found or g.version<>p_expected_version then
    raise exception using errcode='40001',message='admin_unavailable';
  end if;
  select * into preview from admin_private.admin_scope_previews
    where admin_private.admin_scope_previews.preview_id=selected_preview_id for update;
  if not found or preview.actor_user_id<>actor or preview.subject_user_id<>subject
    or preview.store_id<>target_store or preview.grant_id<>g.grant_id
    or preview.grant_version<>g.version or preview.expires_at<=statement_timestamp()
    or preview.consumed_at is not null
    or preview.preview_hash<>extensions.digest(
      convert_to(concat_ws('|',p_operation,subject,target_store,g.grant_id,g.version),'utf8'),
      'sha256'
    ) then
    raise exception using errcode='42501',message='admin_unavailable';
  end if;
  if p_operation='revoke' then
    if g.state not in ('active','reconsent_required') then
      raise exception using errcode='55000',message='admin_unavailable';
    end if;
    select * into app_grant from app_private.role_grants
      where subject_user_id=subject and role='representative' and store_id=target_store and state='active'
      for update;
    if not found then raise exception using errcode='55000',message='admin_unavailable'; end if;
    update partner_private.store_partner_grants
      set state='revoked',revoked_at=statement_timestamp(),revoked_by=actor,version=version+1
      where grant_id=g.grant_id returning * into g;
    insert into partner_private.partner_access_revocations(
      grant_id,auth_user_id,store_id,reason_code,revoked_by,idempotency_key
    ) values(g.grant_id,subject,target_store,'administrator_revoked',actor,p_idempotency_key||'-partner');
    update app_private.role_grants
      set state='revoked',revoked_by=actor,revoked_at=statement_timestamp(),revocation_reason=p_reason_code,version=version+1
      where grant_id=app_grant.grant_id returning * into app_grant;
    prior_app_grant:=app_grant.grant_id;
  else
    if g.state<>'revoked' or not partner_private.partner_consent_is_current(subject)
      or not app_private.provider_user_is_confirmed(subject)
      or not app_private.provider_user_has_verified_mfa(subject)
      or not exists(select 1 from partner_private.pending_partner_identities p where p.auth_user_id=subject and p.state='bound' and p.verified_email_at is not null and p.mfa_verified_at is not null)
      or not (
        exists(select 1 from partner_private.listing_claims c where c.claimant_id=subject and c.store_id=target_store and c.state='approved'
          and (select count(distinct channel_class) from partner_private.claim_authority_signals s where s.claim_id=c.claim_id and s.status='verified')>=2)
        or exists(select 1 from partner_private.pilot_approval_snapshots a join partner_private.pilot_store_drafts d on d.draft_id=a.draft_id
          where a.subject_user_id=subject and a.store_id=target_store and d.state='approved'
          and (select count(distinct channel_class) from partner_private.partner_authority_checks v where v.draft_id=d.draft_id and v.status='verified')>=2)
      ) then raise exception using errcode='42501',message='admin_unavailable'; end if;
    select * into partnership from partner_private.store_partnerships
      where partnership_id=g.partnership_id and auth_user_id=subject and store_id=target_store and state='active'
      for update;
    if not found then raise exception using errcode='42501',message='admin_unavailable'; end if;
    select grant_id into prior_app_grant from app_private.role_grants
      where subject_user_id=subject and role='representative' and store_id=target_store order by granted_at desc limit 1;
    insert into partner_private.store_partner_grants(partnership_id,auth_user_id,store_id,consent_policy_version)
      values(partnership.partnership_id,subject,target_store,partnership.consent_policy_version) returning * into g;
    insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by)
      values(subject,'representative',target_store,'active',actor) returning * into app_grant;
  end if;
  update admin_private.admin_scope_previews set consumed_at=statement_timestamp()
    where admin_private.admin_scope_previews.preview_id=selected_preview_id;
  if p_operation='revoke' then select * into app_grant from app_private.role_grants where grant_id=prior_app_grant; end if;
  insert into admin_private.admin_scope_actions(
    grant_id,subject_user_id,role,store_id,action,prior_grant_id,expected_grant_version,scope_preview_hash,
    reason_code,recent_auth_at,mfa_verified_at,decided_by,outcome,idempotency_key
  ) values(
    app_grant.grant_id,subject,'representative',target_store,p_operation,
    case when p_operation='regrant' then prior_app_grant else null end,p_expected_version,preview.preview_hash,
    p_reason_code,statement_timestamp(),statement_timestamp(),actor,'completed',p_idempotency_key
  );
  result:=jsonb_build_object('grantId',g.grant_id,'state',g.state,'version',g.version);
  insert into admin_private.admin_command_receipts(idempotency_key,actor_user_id,command_kind,resource_id,input_digest,result)
    values(p_idempotency_key,actor,'scope_change',g.grant_id,digest,result);
  perform admin_private.record_operational_admin_event('scope_'||p_operation,actor,g.grant_id,digest,'completed');
  return result;
end $$;
alter function app_public.admin_change_store_scope(text,text,text,bigint,text,text,text) owner to identity_service;
