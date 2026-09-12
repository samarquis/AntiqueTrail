begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is(
  (
    select string_agg(coalesce(r.rolname,'PUBLIC'),',' order by coalesce(r.rolname,'PUBLIC'))
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    left join pg_roles r on r.oid=acl.grantee
    where n.nspname='trip_private'
      and p.proname='email_hmac'
      and pg_get_function_identity_arguments(p.oid)=
        'normalized_email text, target_purpose text, target_environment text, target_version integer'
      and acl.privilege_type='EXECUTE'
  ),
  'identity_service,postgres',
  'only the helper owner and verified-email verifier owner have direct HMAC execution');
select ok(
  has_function_privilege('postgres','trip_private.email_hmac(text,text,text,integer)','EXECUTE'),
  'the verified-email verifier owner can execute the HMAC helper');
select ok(
  not has_function_privilege('anon','trip_private.email_hmac(text,text,text,integer)','EXECUTE')
  and not has_function_privilege('authenticated','trip_private.email_hmac(text,text,text,integer)','EXECUTE')
  and not has_function_privilege('service_role','trip_private.email_hmac(text,text,text,integer)','EXECUTE')
  and not has_function_privilege('authenticator','trip_private.email_hmac(text,text,text,integer)','EXECUTE')
  and not has_function_privilege('trip_email_key_manager','trip_private.email_hmac(text,text,text,integer)','EXECUTE')
  and not has_function_privilege('trip_invitation_signer','trip_private.email_hmac(text,text,text,integer)','EXECUTE')
  and not has_function_privilege('trip_grant_signer','trip_private.email_hmac(text,text,text,integer)','EXECUTE'),
  'browser, transport, and unrelated trip-service roles cannot execute the helper directly');

insert into auth.users(id,email,email_confirmed_at) values
  ('36500000-0000-4000-8000-000000000001','creator-365@example.invalid',statement_timestamp()),
  ('36500000-0000-4000-8000-000000000002','recipient-365@example.invalid',statement_timestamp()),
  ('36500000-0000-4000-8000-000000000003','wrong-365@example.invalid',statement_timestamp()),
  ('36500000-0000-4000-8000-000000000004','unverified-365@example.invalid',null),
  ('36500000-0000-4000-8000-000000000005','unrelated-owner-365@example.invalid',statement_timestamp());
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp()),
  ('36500000-0000-4000-8000-000000000012','36500000-0000-4000-8000-000000000003',statement_timestamp(),statement_timestamp()),
  ('36500000-0000-4000-8000-000000000013','36500000-0000-4000-8000-000000000004',statement_timestamp(),statement_timestamp());

set local role identity_service;
update app_private.profiles
set verified_email_snapshot=case user_id
      when '36500000-0000-4000-8000-000000000001' then 'creator-365@example.invalid'
      when '36500000-0000-4000-8000-000000000002' then 'recipient-365@example.invalid'
      when '36500000-0000-4000-8000-000000000003' then 'wrong-365@example.invalid'
      when '36500000-0000-4000-8000-000000000004' then 'unverified-365@example.invalid'
      else 'unrelated-owner-365@example.invalid' end,
    age_18_attested_at=statement_timestamp()
where user_id in (
  '36500000-0000-4000-8000-000000000001',
  '36500000-0000-4000-8000-000000000002',
  '36500000-0000-4000-8000-000000000003',
  '36500000-0000-4000-8000-000000000004',
  '36500000-0000-4000-8000-000000000005');
insert into app_private.role_grants(subject_user_id,role,state) values
  ('36500000-0000-4000-8000-000000000001','shopper','active'),
  ('36500000-0000-4000-8000-000000000002','shopper','active'),
  ('36500000-0000-4000-8000-000000000003','shopper','active'),
  ('36500000-0000-4000-8000-000000000004','shopper','active'),
  ('36500000-0000-4000-8000-000000000005','shopper','active');

insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date)
select fixture.trip_id,fixture.owner_id,a.id,fixture.name,current_date
from (values
  ('36500000-0000-4000-8000-000000000101'::uuid,'36500000-0000-4000-8000-000000000001'::uuid,'Selected invitation'),
  ('36500000-0000-4000-8000-000000000102'::uuid,'36500000-0000-4000-8000-000000000001'::uuid,'Unverified control'),
  ('36500000-0000-4000-8000-000000000103'::uuid,'36500000-0000-4000-8000-000000000001'::uuid,'Expired control'),
  ('36500000-0000-4000-8000-000000000104'::uuid,'36500000-0000-4000-8000-000000000001'::uuid,'Revoked control'),
  ('36500000-0000-4000-8000-000000000105'::uuid,'36500000-0000-4000-8000-000000000005'::uuid,'Unrelated trip')
) fixture(trip_id,owner_id,name)
cross join lateral (select id from app_public.catalog_areas order by sort_order limit 1) a;
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
select trip_id,owner_id,'creator' from trip_private.trips
where trip_id between '36500000-0000-4000-8000-000000000101' and '36500000-0000-4000-8000-000000000105';
reset role;

set local role trip_email_key_manager;
insert into trip_private.email_hmac_keys(environment,purpose,key_version,key_material,state)
values ('shared_alpha','trip_invitation',365,extensions.digest(convert_to('issue-365-local-key-material','utf8'),'sha256'),'active');
reset role;

set local role identity_service;
insert into trip_private.trip_invitations(
  invitation_id,trip_id,token_hash,recipient_email_hmac,expires_at,state,idempotency_key,
  environment,purpose,email_hmac_key_version)
select fixture.invitation_id,fixture.trip_id,
  extensions.digest(convert_to(fixture.token,'utf8'),'sha256'),h.value,fixture.expires_at,fixture.state,
  fixture.idempotency_key,'shared_alpha','trip_invitation',h.key_version
from (values
  ('36500000-0000-4000-8000-000000000201'::uuid,'36500000-0000-4000-8000-000000000101'::uuid,repeat('a',32),'recipient-365@example.invalid',statement_timestamp()+interval '1 day','pending','issue365-valid'),
  ('36500000-0000-4000-8000-000000000202'::uuid,'36500000-0000-4000-8000-000000000102'::uuid,repeat('b',32),'unverified-365@example.invalid',statement_timestamp()+interval '1 day','pending','issue365-unverified'),
  ('36500000-0000-4000-8000-000000000203'::uuid,'36500000-0000-4000-8000-000000000103'::uuid,repeat('c',32),'recipient-365@example.invalid',statement_timestamp()-interval '1 minute','pending','issue365-expired'),
  ('36500000-0000-4000-8000-000000000204'::uuid,'36500000-0000-4000-8000-000000000104'::uuid,repeat('d',32),'recipient-365@example.invalid',statement_timestamp()+interval '1 day','revoked','issue365-revoked'),
  ('36500000-0000-4000-8000-000000000205'::uuid,'36500000-0000-4000-8000-000000000105'::uuid,repeat('e',32),'recipient-365@example.invalid',statement_timestamp()+interval '1 day','pending','issue365-unrelated')
) fixture(invitation_id,trip_id,token,recipient_email,expires_at,state,idempotency_key)
cross join lateral trip_private.email_hmac(
  fixture.recipient_email,'trip_invitation','shared_alpha',365) h;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"36500000-0000-4000-8000-000000000002","role":"authenticated","session_id":"36500000-0000-4000-8000-000000000011"}',true);
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'recipient session registers');
select set_config('request.jwt.claims','{"sub":"36500000-0000-4000-8000-000000000003","role":"authenticated","session_id":"36500000-0000-4000-8000-000000000012"}',true);
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'wrong-recipient session registers');
select set_config('request.jwt.claims','{"sub":"36500000-0000-4000-8000-000000000004","role":"authenticated","session_id":"36500000-0000-4000-8000-000000000013"}',true);
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'unverified-recipient session registers');

select set_config('request.jwt.claims','{"sub":"36500000-0000-4000-8000-000000000003","role":"authenticated","session_id":"36500000-0000-4000-8000-000000000012"}',true);
select throws_ok(
  $$select app_public.accept_trip_invitation(repeat('a',32))$$,
  'P0001','not_allowed','wrong recipient remains denied');
reset role;
set local role identity_service;
select is((select state from trip_private.trip_invitations where invitation_id='36500000-0000-4000-8000-000000000201'),'pending','wrong-recipient denial leaves invitation pending');
select is((select count(*) from trip_private.trip_participants where trip_id='36500000-0000-4000-8000-000000000101' and participant_role='partner'),0::bigint,'wrong-recipient denial creates no membership');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"36500000-0000-4000-8000-000000000004","role":"authenticated","session_id":"36500000-0000-4000-8000-000000000013"}',true);
select throws_ok(
  $$select app_public.accept_trip_invitation(repeat('b',32))$$,
  'P0001','not_allowed','unverified recipient remains denied');
select set_config('request.jwt.claims','{"sub":"36500000-0000-4000-8000-000000000002","role":"authenticated","session_id":"36500000-0000-4000-8000-000000000011"}',true);
select throws_ok(
  $$select app_public.accept_trip_invitation('too-short')$$,
  'P0001','not_allowed','malformed token remains denied');
select throws_ok(
  $$select app_public.accept_trip_invitation(repeat('c',32))$$,
  'P0001','not_allowed','expired invitation remains denied');
select throws_ok(
  $$select app_public.accept_trip_invitation(repeat('d',32))$$,
  'P0001','not_allowed','revoked invitation remains denied');

select is(
  (app_public.accept_trip_invitation(repeat('a',32))->>'tripId'),
  '36500000-0000-4000-8000-000000000101',
  'the verified intended recipient accepts the existing invitation');
select throws_ok(
  $$select app_public.accept_trip_invitation(repeat('a',32))$$,
  'P0001','not_allowed','accepted invitation replay remains denied');
reset role;

set local role identity_service;
select ok(
  (select state='accepted'
          and accepted_user_id='36500000-0000-4000-8000-000000000002'
          and accepted_at is not null
          and version=2
   from trip_private.trip_invitations
   where invitation_id='36500000-0000-4000-8000-000000000201'),
  'only the selected invitation records the intended recipient acceptance');
select is(
  (select count(*) from trip_private.trip_participants
   where trip_id='36500000-0000-4000-8000-000000000101'
     and user_id='36500000-0000-4000-8000-000000000002'
     and participant_role='partner' and state='active'),
  1::bigint,
  'acceptance creates exactly one selected-trip membership');
select is(
  (select string_agg(invitation_id::text||':'||state,',' order by invitation_id)
   from trip_private.trip_invitations
   where invitation_id between '36500000-0000-4000-8000-000000000202'
                           and '36500000-0000-4000-8000-000000000205'),
  '36500000-0000-4000-8000-000000000202:pending,36500000-0000-4000-8000-000000000203:pending,36500000-0000-4000-8000-000000000204:revoked,36500000-0000-4000-8000-000000000205:pending',
  'unverified, past-expiry, revoked, and unrelated invitation state is unchanged');
select is(
  (select count(*) from trip_private.trip_participants
   where trip_id between '36500000-0000-4000-8000-000000000102'
                     and '36500000-0000-4000-8000-000000000105'
     and participant_role='partner'),
  0::bigint,
  'control and unrelated trips gain no partner membership');

reset role;
select * from finish();
rollback;
