begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Transaction-local synthetic actors; real sessions, grants, consent and RPCs.
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

insert into portal_private.store_updates(update_id,store_id,author_user_id,update_type,headline,details,content_digest)
values
('13500000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001','announcement','Own update','Own details',decode(repeat('11',32),'hex')),
('13500000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000009','76000000-0000-4000-8000-000000000001','announcement','Other store secret','Other details',decode(repeat('12',32),'hex'));

set local role authenticated;
select is(jsonb_array_length(app_public.portal_list_updates()),1,'active exact Representative reads only one store');
select is(app_public.portal_list_updates()->0->>'headline','Own update','own row is returned, not sibling data');
select lives_ok($$select app_public.portal_get_home()$$,'active exact Representative can open Portal home');
select lives_ok($$select app_public.partner_safe_command('get_status','{}')$$,'bound identity can read its own onboarding status');
select throws_ok($$select app_public.portal_archive_update('13500000-0000-4000-8000-000000000002')$$,'55000','portal_unavailable','sibling store update mutation denies');
select throws_ok($$select app_public.portal_archive_update('13500000-0000-4000-8000-000000000099')$$,'55000','portal_unavailable','guessed update has identical denial');
select throws_ok($$select app_public.portal_restore_update('13500000-0000-4000-8000-000000000002')$$,'55000','portal_unavailable','sibling restore cannot bypass scope');
select throws_ok($$select app_public.portal_archive_update('["13500000-0000-4000-8000-000000000001","13500000-0000-4000-8000-000000000002"]')$$,'22023','portal_unavailable','bulk IDs cannot widen one-object command');
select throws_ok($$select * from portal_private.store_updates$$,'42501',null,'authenticated cannot bypass RPC with direct table read');
select throws_ok($$select * from partner_private.store_partner_grants$$,'42501',null,'authenticated cannot enumerate grants');
reset role;
select is((select state from portal_private.store_updates where update_id='13500000-0000-4000-8000-000000000002'),'live','denied writes leave sibling unchanged');

-- Exercise the same real read boundary with independently changed server facts.
savepoint active_actor;
update partner_private.store_partner_grants set state='revoked' where grant_id='76000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok($$select app_public.portal_get_home()$$,'42501','portal_unavailable','revoked grant denies next request');
select throws_ok($$select app_public.portal_list_updates()$$,'42501','portal_unavailable','revoked grant denies list sibling path');
reset role;
rollback to active_actor;

savepoint active_actor;
select set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{amr}',
  jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp()-interval '11 minutes')::bigint),
  jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp()-interval '11 minutes')::bigint)))::text,true);
set local role authenticated;
select throws_ok($$select app_public.portal_get_home()$$,'42501','portal_unavailable','stale recent authentication denies');
reset role;
rollback to active_actor;

savepoint active_actor;
update app_private.active_sessions set access_token_expires_at=statement_timestamp()-interval '1 second' where session_id='76000000-0000-4000-8000-000000000008';
set local role authenticated;
select throws_ok($$select app_public.portal_list_updates()$$,'42501','portal_unavailable','expired session denies');
reset role;
rollback to active_actor;

savepoint active_actor;
update app_public.stores set audience='regional_readiness',synthetic=false where id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select app_public.portal_get_home()$$,'42501','portal_unavailable','synthetic stage cannot expose a real readiness store');
reset role;
rollback to active_actor;

select set_config('request.jwt.claims','{}',true);
set local role authenticated;
select throws_ok($$select app_public.portal_get_home()$$,'42501','portal_unavailable','missing identity denies even with authenticated database role');
reset role;
set local role anon;
select throws_ok($$select app_public.portal_get_home()$$,'42501',null,'anonymous cannot execute Portal RPC');
select throws_ok($$select * from portal_private.store_updates$$,'42501',null,'anonymous cannot read private base tables');
reset role;

select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('portal_private','partner_private') and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)),'partner and Portal private tables force RLS');
select * from finish();
rollback;
