-- Fixed private deletion principal: no global-mode exemption or runtime membership.
-- Preserve runner membership and existing CREATE rights across owner transfers.
do $migration$
declare
  runner name:=current_user;
  had_identity_membership boolean:=pg_has_role(current_user,'identity_service','MEMBER');
  had_identity_public_create boolean:=has_schema_privilege('identity_service','app_public','CREATE');
  had_identity_private_create boolean:=has_schema_privilege('identity_service','app_private','CREATE');
  preserved_acl jsonb;
  preserved_functions jsonb;
  preserved_service_role jsonb;
  table_name text;
  helper_name text;
begin
  if exists(select 1 from pg_roles where rolname='account_purge_executor') then
    raise exception 'account_purge_executor_already_exists';
  end if;
  select jsonb_agg(jsonb_build_array(c.oid,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
    order by c.oid,a.grantor,a.grantee,a.privilege_type) into preserved_acl
  from pg_class c cross join lateral aclexplode(c.relacl) a
  where c.oid in('shopper_private.saved_stores'::regclass,'shopper_private.private_store_memories'::regclass,
    'shopper_private.private_memory_deletions'::regclass,'trip_private.trips'::regclass,'trip_private.trip_participants'::regclass);
  select jsonb_agg(jsonb_build_array(oid,proowner,proacl,prosecdef,proconfig) order by oid) into preserved_functions
  from pg_proc where oid in('app_private.purge_account_application_data(uuid)'::regprocedure,
    'app_public.prepare_account_deletion(uuid,uuid,timestamptz)'::regprocedure);
  select to_jsonb(r) into preserved_service_role from pg_roles r where rolname='service_role';
  create role account_purge_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  execute format('grant account_purge_executor to %I',runner);
  if not had_identity_membership then execute format('grant identity_service to %I',runner); end if;
  if not had_identity_public_create then grant create on schema app_public to identity_service; end if;
  if not had_identity_private_create then grant create on schema app_private to identity_service; end if;
  grant usage on schema app_private,shopper_private,trip_private to account_purge_executor;
  grant create on schema app_private to account_purge_executor;
  foreach table_name in array array['shopper_private.saved_stores','shopper_private.private_store_memories',
    'shopper_private.private_memory_deletions','trip_private.trips','trip_private.trip_participants'] loop
    execute format('grant select,delete on %s to account_purge_executor',table_name);
    execute format('create policy account_purge_select on %s for select to account_purge_executor using(true)',table_name);
    execute format('create policy account_purge_delete on %s for delete to account_purge_executor using(true)',table_name);
  end loop;
  grant update(navigator_user_id,navigator_device_hash,version,updated_at) on trip_private.trips to account_purge_executor;
  create policy account_purge_update on trip_private.trips for update to account_purge_executor using(true) with check(true);

  set local role account_purge_executor;
  execute $ddl$
create function app_private.purge_internal_shopper_rows(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if p_user_id is null then raise exception using errcode='22023',message='account_deletion_subject_required'; end if;
  delete from shopper_private.saved_stores where user_id=p_user_id;
  delete from shopper_private.private_store_memories where user_id=p_user_id;
  delete from shopper_private.private_memory_deletions where user_id=p_user_id;
  if exists(select 1 from shopper_private.saved_stores where user_id=p_user_id)
    or exists(select 1 from shopper_private.private_store_memories where user_id=p_user_id)
    or exists(select 1 from shopper_private.private_memory_deletions where user_id=p_user_id) then
    raise exception using errcode='55000',message='account_purge_incomplete';
  end if;
end $$;
$ddl$;
  execute $ddl$
create function app_private.purge_internal_owned_trips(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if p_user_id is null then raise exception using errcode='22023',message='account_deletion_subject_required'; end if;
  delete from trip_private.trips where owner_id=p_user_id;
  update trip_private.trips set navigator_user_id=null,navigator_device_hash=null,version=version+1,updated_at=statement_timestamp()
    where navigator_user_id=p_user_id;
  if exists(select 1 from trip_private.trips where owner_id=p_user_id or navigator_user_id=p_user_id) then
    raise exception using errcode='55000',message='account_purge_incomplete';
  end if;
end $$;
$ddl$;
  execute $ddl$
create function app_private.purge_internal_trip_participation(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if p_user_id is null then raise exception using errcode='22023',message='account_deletion_subject_required'; end if;
  delete from trip_private.trip_participants where user_id=p_user_id;
  if exists(select 1 from trip_private.trip_participants where user_id=p_user_id) then
    raise exception using errcode='55000',message='account_purge_incomplete';
  end if;
end $$;
$ddl$;
  foreach helper_name in array array['purge_internal_shopper_rows','purge_internal_owned_trips','purge_internal_trip_participation'] loop
    execute format('revoke all on function app_private.%I(uuid) from public,anon,authenticated,service_role,account_lifecycle_service,authenticator',helper_name);
    execute format('grant execute on function app_private.%I(uuid) to identity_service',helper_name);
  end loop;
  execute format('set local role %I',runner);
  set local role identity_service;
  execute $ddl$
create or replace function app_private.purge_account_application_data(p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare removed jsonb:='[]'::jsonb;
begin
  if p_user_id is null then raise exception using errcode='22023',message='account_deletion_subject_required'; end if;

  perform app_private.purge_internal_shopper_rows(p_user_id);
  delete from shopper_private.catalog_last_seen where user_id=p_user_id;
  delete from shopper_private.catalog_new_dismissals where user_id=p_user_id;
  update shopper_private.store_correction_reports set reporter_user_id=null,description='[deleted]',public_source_url=null,
    assigned_admin_id=null,state='closed',version=version+1,updated_at=statement_timestamp() where reporter_user_id=p_user_id;
  removed:=removed||'"shopper"'::jsonb;

  delete from candidate_private.candidate_share_payloads p using candidate_private.candidate_shares s
    where p.share_id=s.share_id and (s.sender_id=p_user_id or s.recipient_id=p_user_id);
  update candidate_private.candidate_shares set
    candidate_id=case when sender_id=p_user_id then null else candidate_id end,
    sender_id=case when sender_id=p_user_id then null else sender_id end,
    recipient_id=case when recipient_id=p_user_id then null else recipient_id end,
    recipient_email_hmac=extensions.gen_random_bytes(32),version=version+1,updated_at=statement_timestamp()
    where sender_id=p_user_id or recipient_id=p_user_id;
  delete from candidate_private.candidate_blocks where blocker_id=p_user_id or blocked_user_id=p_user_id;
  delete from candidate_private.trip_ideas where owner_user_id=p_user_id;
  delete from candidate_private.candidate_share_delivery_jobs where sender_user_id=p_user_id;
  delete from candidate_private.candidate_concurrency_leases where actor_user_id=p_user_id;
  delete from candidate_private.candidate_links where owner_user_id=p_user_id;
  removed:=removed||'"candidate"'::jsonb;

  perform app_private.purge_internal_owned_trips(p_user_id);
  delete from trip_private.trip_visit_memories where author_user_id=p_user_id;
  delete from trip_private.trip_offline_grants where user_id=p_user_id;
  delete from trip_private.trip_device_bindings where user_id=p_user_id;
  perform app_private.purge_internal_trip_participation(p_user_id);
  delete from trip_private.trip_device_proof_nonces where user_id=p_user_id;
  removed:=removed||'"trips"'::jsonb;

  update partner_private.store_partner_grants set state='revoked',revoked_at=coalesce(revoked_at,statement_timestamp()),
    revoked_by=null,version=version+1 where auth_user_id=p_user_id and state='active';
  update partner_private.store_partnerships set state='revoked',ended_at=coalesce(ended_at,statement_timestamp()),
    auth_user_id=null,version=version+1,updated_at=statement_timestamp() where auth_user_id=p_user_id;
  update partner_private.listing_claims set state='revoked',revoked_at=coalesce(revoked_at,statement_timestamp()),
    claimant_id=null,assigned_admin_id=null,version=version+1,updated_at=statement_timestamp() where claimant_id=p_user_id;
  update partner_private.store_partner_grants set auth_user_id=null where auth_user_id=p_user_id;
  update partner_private.partner_invitations set created_by=null where created_by=p_user_id;
  removed:=removed||'"partner_revoked"'::jsonb;

  update app_private.role_grants set state='revoked',revoked_at=coalesce(revoked_at,statement_timestamp()),revoked_by=null,
    revocation_reason=coalesce(revocation_reason,'account_deleted'),version=version+1 where subject_user_id=p_user_id and state in ('active','pending');
  update app_private.role_grants set granted_by=null where granted_by=p_user_id;
  update app_private.role_grants set revoked_by=null where revoked_by=p_user_id;
  update app_private.role_grants set subject_user_id=null where subject_user_id=p_user_id;
  update app_private.environment_stage set changed_by=null where changed_by=p_user_id;
  update app_private.account_registration_config set updated_by=null where updated_by=p_user_id;
  update app_private.admin_bootstrap_state set subject_user_id=null,subject_binding_state='cleared' where subject_user_id=p_user_id;
  delete from app_private.feature_restrictions where subject_user_id=p_user_id;
  delete from app_private.provider_revocation_outbox where user_id=p_user_id;
  delete from app_private.notification_deliveries where user_id=p_user_id;
  delete from app_private.account_export_download_handoffs where user_id=p_user_id;
  delete from app_private.account_export_jobs where user_id=p_user_id;
  delete from app_private.active_sessions where user_id=p_user_id;
  delete from trip_private.check_my_day_command_evidence where actor_user_id=p_user_id;
  delete from trip_private.check_my_day_requests where actor_user_id=p_user_id;
  delete from trip_private.trip_conflict_resolution_receipts where actor_user_id=p_user_id;
  perform app_private.purge_account_internal_bindings(p_user_id);
  update rg01_private.rg01_subject_consents set user_id=null,withdrawn_at=coalesce(withdrawn_at,statement_timestamp()) where user_id=p_user_id;
  delete from app_private.profiles where user_id=p_user_id;
  if exists(select 1 from app_private.profiles where user_id=p_user_id)
    or exists(select 1 from trip_private.trip_create_receipts where actor_user_id=p_user_id) then
    raise exception using errcode='55000',message='account_purge_incomplete';
  end if;
  return removed;
end $$;
$ddl$;
  execute $ddl$
create or replace function app_public.prepare_account_deletion(p_deletion_request_id uuid,p_claim_token uuid,p_prepared_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare d app_private.account_deletion_requests%rowtype; scopes jsonb;
begin
  select * into d from app_private.account_deletion_requests where deletion_request_id=p_deletion_request_id for update;
  if not found then raise exception using errcode='42501',message='account_deletion_claim_invalid'; end if;
  if d.state='completed' then return jsonb_build_object('state','completed'); end if;
  if d.state is distinct from 'scheduled' or p_claim_token is null or d.claim_token is null
    or d.claim_token is distinct from p_claim_token or d.lease_expires_at is null
    or d.lease_expires_at<=statement_timestamp() or d.due_at is null or d.due_at>statement_timestamp()
    then raise exception using errcode='42501',message='account_deletion_claim_invalid'; end if;
  if d.prepared_at is null then
    scopes:=app_private.purge_account_application_data(d.user_id);
    update app_private.account_deletion_requests set prepared_at=statement_timestamp(),subject_tombstone=coalesce(subject_tombstone,extensions.gen_random_uuid())
      where deletion_request_id=d.deletion_request_id;
  end if;
  return jsonb_build_object('state','prepared');
end $$;
$ddl$;
  execute format('set local role %I',runner);
  revoke create on schema app_private from account_purge_executor;
  execute format('revoke account_purge_executor from %I',runner);
  if not had_identity_public_create then revoke create on schema app_public from identity_service; end if;
  if not had_identity_private_create then revoke create on schema app_private from identity_service; end if;
  if not had_identity_membership then execute format('revoke identity_service from %I',runner); end if;

  if (select jsonb_agg(jsonb_build_array(c.oid,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      order by c.oid,a.grantor,a.grantee,a.privilege_type)
    from pg_class c cross join lateral aclexplode(c.relacl) a
    where c.oid in('shopper_private.saved_stores'::regclass,'shopper_private.private_store_memories'::regclass,
      'shopper_private.private_memory_deletions'::regclass,'trip_private.trips'::regclass,'trip_private.trip_participants'::regclass)
      and a.grantee<>'account_purge_executor'::regrole) is distinct from preserved_acl
    or (select to_jsonb(r) from pg_roles r where rolname='service_role') is distinct from preserved_service_role
    or (select jsonb_agg(jsonb_build_array(oid,proowner,proacl,prosecdef,proconfig) order by oid)
      from pg_proc where oid in('app_private.purge_account_application_data(uuid)'::regprocedure,
        'app_public.prepare_account_deletion(uuid,uuid,timestamptz)'::regprocedure)) is distinct from preserved_functions then
    raise exception 'account_purge_existing_authority_changed';
  end if;
  if (select array_agg(attname::text order by attname) from pg_attribute
    where attrelid='trip_private.trips'::regclass and attnum>0 and not attisdropped
      and has_column_privilege('account_purge_executor',attrelid,attnum,'UPDATE'))
      is distinct from array['navigator_device_hash','navigator_user_id','updated_at','version']
    or exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where a.grantee='account_purge_executor'::regrole and
       (c.oid not in('shopper_private.saved_stores'::regclass,'shopper_private.private_store_memories'::regclass,
        'shopper_private.private_memory_deletions'::regclass,'trip_private.trips'::regclass,'trip_private.trip_participants'::regclass)
        or a.privilege_type not in('SELECT','DELETE'))) then
    raise exception 'account_purge_executor_grants_invalid';
  end if;
  if exists(select 1 from pg_auth_members where roleid='account_purge_executor'::regrole or member='account_purge_executor'::regrole)
    or has_schema_privilege('account_purge_executor','app_private','CREATE')
    or pg_has_role(runner,'identity_service','MEMBER') is distinct from had_identity_membership
    or has_schema_privilege('identity_service','app_public','CREATE') is distinct from had_identity_public_create
    or has_schema_privilege('identity_service','app_private','CREATE') is distinct from had_identity_private_create then
    raise exception 'account_purge_authority_not_restored';
  end if;
  if exists(select 1 from pg_roles where rolname='account_purge_executor' and
    (rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) then
    raise exception 'account_purge_executor_attributes_invalid';
  end if;
  foreach helper_name in array array['purge_internal_shopper_rows','purge_internal_owned_trips','purge_internal_trip_participation'] loop
    if not exists(select 1 from pg_proc p where p.oid=format('app_private.%I(uuid)',helper_name)::regprocedure
      and p.proowner='account_purge_executor'::regrole and p.prosecdef and p.proconfig=array['search_path=""'])
      or not has_function_privilege('identity_service',format('app_private.%I(uuid)',helper_name),'EXECUTE')
      or exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
        where p.oid=format('app_private.%I(uuid)',helper_name)::regprocedure and a.privilege_type='EXECUTE'
          and a.grantee not in('account_purge_executor'::regrole,'identity_service'::regrole)) then
      raise exception 'account_purge_helper_acl_invalid';
    end if;
  end loop;
  if exists(select 1 from pg_class where oid in('shopper_private.saved_stores'::regclass,'shopper_private.private_store_memories'::regclass,
    'shopper_private.private_memory_deletions'::regclass,'trip_private.trips'::regclass,'trip_private.trip_participants'::regclass)
    and not(relrowsecurity and relforcerowsecurity)) then raise exception 'account_purge_rls_invalid'; end if;
end;
$migration$;
