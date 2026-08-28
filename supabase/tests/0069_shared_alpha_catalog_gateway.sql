begin;
create extension if not exists pgtap with schema extensions;
select plan(24);
grant public_catalog_gateway,identity_service to postgres;
grant usage on schema extensions to public_catalog_gateway;

select has_role('synthetic_catalog_automation','shared-alpha catalog uses a constrained owner');
select has_function('app_public','synthetic_catalog_gateway_request',
  array['text','uuid','uuid','text','jsonb'],'bounded shared-alpha catalog gateway exists');
select ok(has_function_privilege('public_catalog_gateway',
  'app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon',
  'app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated',
  'app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE'),
  'only the server catalog gateway can invoke the shared-alpha boundary');
select ok(not has_function_privilege('public_catalog_gateway',
  'app_public.catalog_list(text,text,text)','EXECUTE'),
  'the HTTP gateway role cannot bypass shared-alpha admission');
select ok(not has_schema_privilege('synthetic_catalog_automation','app_public','CREATE')
  and not has_table_privilege('synthetic_catalog_automation','app_public.stores','SELECT'),
  'the constrained owner cannot create objects or read catalog tables directly');

set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('0',64),null,null,'list','{}')$$,'42501'::character(5),'synthetic_catalog_evidence_invalid',
  'the default unsigned synthetic stage fails closed rather than falling back');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('0',64),null,null,'map','{}')$$,'42501'::character(5),'synthetic_catalog_map_disabled',
  'synthetic alpha disables map at the server boundary before any projection');
reset role;

set local role identity_service;
update app_private.environment_stage set stage='private_beta' where id=1;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('0',64),null,null,'list','{}')$$,'P0001'::character(5),'synthetic_catalog_outside_stage',
  'only a genuinely non-alpha stage permits the Edge gateway public fallback');
reset role;
set local role identity_service;
update app_private.environment_stage set stage='synthetic_alpha' where id=1;
reset role;

insert into auth.users(id) values
  ('69000000-0000-4000-8000-000000000001'),
  ('69000000-0000-4000-8000-000000000011');
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at)
values
  ('69000000-0000-4000-8000-000000000001','alpha@example.test',statement_timestamp()),
  ('69000000-0000-4000-8000-000000000011','sibling@example.test',statement_timestamp())
on conflict (user_id) do update set
  verified_email_snapshot=excluded.verified_email_snapshot,
  age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.active_sessions(
  session_id,user_id,provider_created_at,session_epoch,state,access_token_expires_at
) values
(
  '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000001',
  statement_timestamp(),1,'active',statement_timestamp()+interval '30 minutes'
),(
  '69000000-0000-4000-8000-000000000012','69000000-0000-4000-8000-000000000011',
  statement_timestamp(),1,'active',statement_timestamp()+interval '30 minutes'
);
insert into app_private.role_grants(subject_user_id,role,state)
values
  ('69000000-0000-4000-8000-000000000001','shopper','active'),
  ('69000000-0000-4000-8000-000000000011','shopper','active');
update app_private.environment_stage set receipt_id='69000000-0000-4000-8000-000000000003',
  capabilities=capabilities||'{"private_auth":true}'::jsonb where id=1;
update app_private.account_registration_config set mode='receipt_only',
  stage_receipt_id='69000000-0000-4000-8000-000000000004' where id=1;
reset role;

set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('1',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{}')$$,
  '42501'::character(5),'synthetic_catalog_evidence_invalid',
  'mismatched stage receipts fail closed rather than falling back');
reset role;
set local role identity_service;
update app_private.account_registration_config
set stage_receipt_id='69000000-0000-4000-8000-000000000003' where id=1;
reset role;
update app_private.registration_quarantine_latch
set state='blocked',blocked_at=statement_timestamp() where id=1;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('1',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{}')$$,
  '42501'::character(5),'synthetic_catalog_evidence_invalid',
  'a revoked quarantine latch fails closed rather than falling back');
reset role;
update app_private.registration_quarantine_latch set state='open',blocked_at=null where id=1;

set local role public_catalog_gateway;
select extensions.ok(jsonb_array_length(app_public.synthetic_catalog_gateway_request(
  repeat('2',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{}'))>0,
  'an active admitted shopper can read the synthetic catalog');
select is(jsonb_array_length(app_public.synthetic_catalog_gateway_request(
  repeat('3',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{"p_q":"clockwork"}')),1,
  'shared-alpha search remains bounded to matching synthetic stores');
select is(jsonb_array_length(app_public.synthetic_catalog_gateway_request(
  repeat('4',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','details','{"p_slug":"clockwork-cabinet"}')),1,
  'shared-alpha detail returns one admitted synthetic store');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('5',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000099','list','{}')$$,
  '42501'::character(5),'synthetic_catalog_forbidden','a mismatched session fails closed');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('6',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000012','list','{}')$$,
  '42501'::character(5),'synthetic_catalog_forbidden',
  'a sibling user session cannot authorize another shopper row');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('7',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{"extra":true}')$$,
  'P0001'::character(5),'gateway_request_invalid','unknown catalog arguments fail closed');
select ok(pg_catalog.set_config('request.jwt.claims',jsonb_build_object(
  'sub','69000000-0000-4000-8000-000000000011','role','authenticated',
  'session_id','69000000-0000-4000-8000-000000000012')::text,true) is not null
  and jsonb_array_length(app_public.synthetic_catalog_gateway_request(
    repeat('8',64),'69000000-0000-4000-8000-000000000001',
    '69000000-0000-4000-8000-000000000002','list','{}'))>0,
  'forged caller claims cannot replace the provider-verified gateway binding');
set local search_path=pg_temp,public;
select pg_catalog.set_config('app.test_hostile_result',(
  jsonb_array_length(app_public.synthetic_catalog_gateway_request(
  repeat('9',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{}'))>0)::text,true);
set local search_path=public,extensions;
select ok(current_setting('app.test_hostile_result')='true',
  'a hostile caller search path cannot redirect schema-qualified gateway objects');
reset role;

set local role identity_service;
update app_private.profiles set sessions_revoked_before=statement_timestamp()-interval '1 minute'
where user_id='69000000-0000-4000-8000-000000000001';
update app_private.active_sessions
set provider_created_at=statement_timestamp()-interval '2 minutes',created_at=statement_timestamp()
where session_id='69000000-0000-4000-8000-000000000002';
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('a',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{}')$$,
  '42501'::character(5),'synthetic_catalog_forbidden',
  'a pre-revocation provider session stays denied even when registered later');
reset role;
set local role identity_service;
update app_private.profiles set sessions_revoked_before=null
where user_id='69000000-0000-4000-8000-000000000001';
update app_private.active_sessions set provider_created_at=statement_timestamp()
where session_id='69000000-0000-4000-8000-000000000002';
update app_private.role_grants set state='revoked',revoked_at=statement_timestamp()
where subject_user_id='69000000-0000-4000-8000-000000000001' and role='shopper';
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('b',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{}')$$,
  '42501'::character(5),'synthetic_catalog_forbidden',
  'a stale or revoked shopper grant immediately loses catalog access');
reset role;
set local role identity_service;
update app_private.role_grants set state='active',revoked_at=null
where subject_user_id='69000000-0000-4000-8000-000000000001' and role='shopper';
reset role;

with added as (
  insert into app_public.stores(
    slug,name,town,state_code,address,area_id,summary,description,timezone_name,
    synthetic,audience,publication_state
  )
  select 'alpha-bound-'||lpad(n::text,2,'0'),'Alpha Bound '||n,'Topeka','KS',
    n||' Synthetic Way','00000000-0000-4000-8000-000000000001',
    'Synthetic bounded-result fixture','Synthetic bounded-result fixture for gateway testing.',
    'America/Chicago',true,'synthetic','active'
  from generate_series(1,39) n
  returning id
)
insert into app_public.store_fact_verifications(
  store_id,verification_group,verified_at,provenance_label,verifier_kind
)
select id,g,statement_timestamp(),'Synthetic bounded-result test','synthetic_fixture'
from added cross join unnest(enum_range(null::app_public.verification_group)) g
where g<>'media_social'::app_public.verification_group;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('c',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{}')$$,
  'P0001'::character(5),'catalog_too_large',
  'an excessive synthetic result set is rejected instead of returned');
reset role;

set local role identity_service;
update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp()
where session_id='69000000-0000-4000-8000-000000000002';
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(
  repeat('d',64),'69000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000002','list','{}')$$,
  '42501'::character(5),'synthetic_catalog_forbidden','a revoked session immediately loses catalog access');
reset role;

select ok(position('synthetic_catalog_outside_stage' in pg_get_functiondef(
  'app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)'::regprocedure))>0
  and position('synthetic_catalog_evidence_invalid' in pg_get_functiondef(
  'app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)'::regprocedure))>0
  and position('synthetic_catalog_forbidden' in pg_get_functiondef(
  'app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)'::regprocedure))>0,
  'stage and account authorization are distinct fail-closed gates');
select ok((select not rolcanlogin and not rolsuper and not rolbypassrls
  from pg_roles where rolname='synthetic_catalog_automation'),
  'the shared-alpha owner cannot log in or bypass RLS');

select * from finish();
rollback;
