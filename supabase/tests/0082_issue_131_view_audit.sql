-- Real RPC/RLS/session checks; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into app_public.stores (id, slug, name, town, state_code, address, area_id, summary, description)
values ('00000000-0000-4000-8000-000000000001','db-ci-portal-media-store','Test Store','Topeka','KS','1 Test Way','00000000-0000-4000-8000-000000000001','Database CI fixture','Database CI fixture store')
on conflict (id) do nothing;
insert into app_public.stores (id, slug, name, town, state_code, address, area_id, summary, description)
values ('00000000-0000-4000-8000-000000000009','db-ci-portal-media-other-store','Other Store','Topeka','KS','2 Test Way','00000000-0000-4000-8000-000000000001','Database CI fixture','Other Database CI fixture store')
on conflict (id) do nothing;
insert into auth.users(id) values ('76000000-0000-4000-8000-000000000001');
insert into auth.mfa_factors(id, user_id, factor_type, status, created_at, updated_at)
values (
  '76000000-0000-4000-8000-000000000024', '76000000-0000-4000-8000-000000000001',
  'totp', 'verified', statement_timestamp(), statement_timestamp()
);
insert into partner_private.partner_invitations(
  invitation_id, token_hash, recipient_email_hmac, created_by, state, consumed_at
) values (
  '76000000-0000-4000-8000-000000000002', decode(repeat('01',32),'hex'),
  decode(repeat('02',32),'hex'), '76000000-0000-4000-8000-000000000001', 'consumed', statement_timestamp()
);
insert into partner_private.pending_partner_identities(
  pending_identity_id, invitation_id, email_hmac, auth_user_id, state,
  verified_email_at, mfa_verified_at, bound_at
) values (
  '76000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000002',
  decode(repeat('02',32),'hex'), '76000000-0000-4000-8000-000000000001', 'bound',
  statement_timestamp(), statement_timestamp(), statement_timestamp()
);
insert into partner_private.provisional_partner_consents(
  provisional_consent_id, invitation_id, pending_identity_id, policy_version,
  typed_name, business_title, store_name, owner_email_hmac,
  authority_ack, voluntary_ack, permitted_data_ack, no_payment_endorsement_ack,
  withdrawal_ack, idempotency_key
) values (
  '76000000-0000-4000-8000-000000000004', '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000003', 'synthetic-v3', 'Portal Test Owner',
  'Owner', 'Test Store', decode(repeat('02',32),'hex'), true, true, true, true, true,
  'portal-media-history-consent'
);
insert into partner_private.pilot_consent_receipts(
  consent_receipt_id, provisional_consent_id, pending_identity_id, invitation_id,
  auth_user_id, verified_email_hmac, policy_version, receipt_checksum
) values (
  '76000000-0000-4000-8000-000000000005', '76000000-0000-4000-8000-000000000004',
  '76000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000001', decode(repeat('02',32),'hex'), 'synthetic-v3',
  decode(repeat('03',32),'hex')
);
insert into partner_private.store_partnerships(
  partnership_id, pending_identity_id, auth_user_id, store_id, consent_receipt_id,
  state, started_at
) values (
  '76000000-0000-4000-8000-000000000006', '76000000-0000-4000-8000-000000000003',
  '76000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000005', 'active', statement_timestamp()
);
insert into partner_private.store_partner_grants(
  grant_id, partnership_id, auth_user_id, store_id
) values (
  '76000000-0000-4000-8000-000000000007', '76000000-0000-4000-8000-000000000006',
  '76000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'
);
set local role identity_service;
insert into app_private.active_sessions(
  session_id, user_id, provider_created_at, session_epoch, last_authenticated_at,
  mfa_verified_at, access_token_expires_at
) values (
  '76000000-0000-4000-8000-000000000008', '76000000-0000-4000-8000-000000000001',
  statement_timestamp(), 1, statement_timestamp(), statement_timestamp(),
  statement_timestamp() + interval '30 minutes'
);
reset role;
do $$ begin
  perform set_config('request.jwt.claims',
    jsonb_build_object(
      'sub','76000000-0000-4000-8000-000000000001',
      'session_id','76000000-0000-4000-8000-000000000008',
      'aal','aal2',
      'amr',jsonb_build_array(
        jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
        jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)
      )
    )::text, true);
end $$;
insert into app_private.role_grants(subject_user_id,role)
values('76000000-0000-4000-8000-000000000001','administrator');
update app_private.audit_anchor_capability set deployment_environment='local',state='disabled',
  provider_key=null,provider_version=null,contract_receipt_id=null,watchdog_state='disabled',
  last_ack_sequence=0,last_ack_root=null,last_ack_at=null,version=version+1 where id=1;
insert into admin_private.admin_review_cases(case_id,case_type,target_kind,target_id,store_id,snapshot_hash,state,assigned_admin_id)
values('13100000-0000-4000-8000-000000000001','access_safety','store',
  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  decode(repeat('11',32),'hex'),'claimed','76000000-0000-4000-8000-000000000001'),
('13100000-0000-4000-8000-000000000002','access_safety','store',
  '00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000009',
  decode(repeat('22',32),'hex'),'open',null);
insert into admin_private.admin_case_events(case_id,event_kind,to_state,idempotency_key,occurred_at)
values('13100000-0000-4000-8000-000000000001','created','open','131-created',statement_timestamp()-interval '2 minutes'),
('13100000-0000-4000-8000-000000000001','claimed','claimed','131-claimed',statement_timestamp()-interval '1 minute'),
('13100000-0000-4000-8000-000000000002','rejected','rejected','131-other',statement_timestamp());
set local role identity_service;
select admin_private.record_operational_admin_event('scope_revoke','76000000-0000-4000-8000-000000000001',
 '76000000-0000-4000-8000-000000000007',decode(repeat('11',32),'hex'),'completed');
reset role;

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='admin_private.record_audit_access'::regclass),'references FORCE RLS');
select ok(not has_table_privilege('authenticated','admin_private.record_audit_access','SELECT'),'browser cannot enumerate references');
select ok(not has_function_privilege('authenticated','admin_private.issue_record_audit_access(text,uuid,bigint)','EXECUTE'),'browser cannot mint arbitrary references');
select ok((select rolname='identity_service' and not rolbypassrls from pg_roles where oid=(select proowner from pg_proc where oid='app_public.admin_read_record_audit(text)'::regprocedure)),'RPC runs as non-bypass identity role');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='app_public.admin_read_record_audit(text)'::regprocedure),'RPC pins search path');

set local role anon;
select throws_ok($$select app_public.admin_read_record_audit('13100000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous denied');
reset role;
set local role authenticated;
select throws_ok($$select app_public.admin_read_record_audit('13100000-0000-4000-8000-000000000001')$$,'42501','admin_unavailable','record ID is not an audit reference');
select throws_ok($$select app_public.admin_read_record_audit(null)$$,'42501','admin_unavailable','null denied');
select throws_ok($$select app_public.admin_read_record_audit('[]')$$,'42501','admin_unavailable','bulk input denied');
select set_config('test.case_access',app_public.admin_get_review_case('13100000-0000-4000-8000-000000000001')->>'auditAccess',true);
select set_config('test.grant_access',(select value->>'auditAccess' from jsonb_array_elements(app_public.admin_list_store_scopes()) where value->>'grantId'='76000000-0000-4000-8000-000000000007'),true);
select is(app_public.admin_read_record_audit(current_setting('test.case_access'))->0->>'action','created','events in chronological order');
select is(jsonb_array_length(app_public.admin_read_record_audit(current_setting('test.case_access'))),2,'exact case excludes sibling events and duplicate privileged receipts');
select is((select array_agg(key order by key) from jsonb_object_keys(app_public.admin_read_record_audit(current_setting('test.case_access'))->0) key),
  array['action','occurredAt','outcome'],'only minimized fields returned');
select is(app_public.admin_read_record_audit(current_setting('test.grant_access'))->0->>'action','admin_scope_revoke','exact grant audit allowed');
reset role;
select ok(exists(select 1 from app_private.privileged_audit_events where resource_id='13100000-0000-4000-8000-000000000001' and action='admin_audit_viewed'),'successful read audited');
select throws_ok($$update app_private.privileged_audit_events set outcome='failed' where resource_id='13100000-0000-4000-8000-000000000001'$$,'42501',null,'audit remains append-only');
-- A second live session cannot reuse the first session's reference.
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,access_token_expires_at)
values('13100000-0000-4000-8000-000000000008','76000000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp()+interval '30 minutes');
select set_config('test.original_claims',current_setting('request.jwt.claims'),true);
select set_config('request.jwt.claims',jsonb_set(current_setting('test.original_claims')::jsonb,'{session_id}','"13100000-0000-4000-8000-000000000008"')::text,true);
set local role authenticated;
select lives_ok($$select app_public.admin_list_store_scopes()$$,'second session is authorized for its own selection');
select throws_ok($$select app_public.admin_read_record_audit(current_setting('test.case_access'))$$,'42501','admin_unavailable','reference cannot cross live sessions');
reset role;
select set_config('request.jwt.claims',current_setting('test.original_claims'),true);
update admin_private.admin_review_cases set version=version+1 where case_id='13100000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select app_public.admin_read_record_audit(current_setting('test.case_access'))$$,'42501','admin_unavailable','changed record version invalidates reference');
select set_config('test.case_access',app_public.admin_get_review_case('13100000-0000-4000-8000-000000000001')->>'auditAccess',true);
reset role;
update admin_private.admin_review_cases set assigned_admin_id=null where case_id='13100000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select app_public.admin_read_record_audit(current_setting('test.case_access'))$$,'42501','admin_unavailable','unassigned case denies existing reference');
reset role;
update admin_private.admin_review_cases set assigned_admin_id='76000000-0000-4000-8000-000000000001' where case_id='13100000-0000-4000-8000-000000000001';
update admin_private.record_audit_access set expires_at=statement_timestamp()-interval '1 second' where record_kind='case';
set local role authenticated;
select throws_ok($$select app_public.admin_read_record_audit(current_setting('test.case_access'))$$,'42501','admin_unavailable','expired reference denied');
select set_config('test.case_access',app_public.admin_get_review_case('13100000-0000-4000-8000-000000000001')->>'auditAccess',true);
reset role;
update partner_private.store_partner_grants set version=version+1 where grant_id='76000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok($$select app_public.admin_read_record_audit(current_setting('test.grant_access'))$$,'42501','admin_unavailable','changed grant invalidates reference');
reset role;
update admin_private.admin_audit_anchor_health set state='blocked' where id=1;
set local role authenticated;
select throws_ok($$select app_public.admin_read_record_audit(current_setting('test.case_access'))$$,'42501','admin_unavailable','unhealthy audit fails closed');
reset role;
update admin_private.admin_audit_anchor_health set state='healthy' where id=1;
select set_config('test.claims',current_setting('request.jwt.claims'),true);
select set_config('request.jwt.claims',jsonb_set(current_setting('test.claims')::jsonb,'{amr}',
  jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp()-interval '11 minutes')::bigint)))::text,true);
set local role authenticated;
select throws_ok($$select app_public.admin_read_record_audit(current_setting('test.case_access'))$$,'42501','admin_unavailable','stale provider authentication denied');
reset role;
select set_config('request.jwt.claims',current_setting('test.claims'),true);
update app_private.role_grants set state='revoked',revoked_at=statement_timestamp()
  where subject_user_id='76000000-0000-4000-8000-000000000001' and role='administrator';
set local role authenticated;
select throws_ok($$select app_public.admin_read_record_audit(current_setting('test.case_access'))$$,'42501','admin_unavailable','revoked Administrator denied immediately');
reset role;
update app_private.role_grants set state='active',revoked_at=null
  where subject_user_id='76000000-0000-4000-8000-000000000001' and role='administrator';
update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp()
  where session_id='76000000-0000-4000-8000-000000000008';
set local role authenticated;
select throws_ok($$select app_public.admin_read_record_audit(current_setting('test.case_access'))$$,'42501','admin_unavailable','revoked session denied immediately');
reset role;
select * from finish();
rollback;
