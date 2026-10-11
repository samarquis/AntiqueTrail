begin;
create extension if not exists pgtap with schema extensions;
select plan(29);
grant identity_service to postgres;
grant usage on schema extensions to authenticated;
insert into auth.users(id) values ('99000000-0000-4000-8000-000000000001');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('99000000-0000-4000-8000-000000000011','99000000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp());
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at) values
 ('99000000-0000-4000-8000-000000000001','shopper-a@review-reset-20260906.invalid',statement_timestamp())
on conflict(user_id) do update set verified_email_snapshot=excluded.verified_email_snapshot,age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id,role,state) values
 ('99000000-0000-4000-8000-000000000001','shopper','active');
reset role;
insert into internal_review_private.identities(user_id,alias,fixture_namespace,controlled_address)
values ('99000000-0000-4000-8000-000000000001','shopper-a','review-reset-20260906','shopper-a@review-reset-20260906.invalid');
insert into internal_review_private.runtime_binding values
 (1,'ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app','product-reset-task',statement_timestamp(),1);
insert into internal_review_private.authorizations(
 receipt_id,schema_version,context,owner_decision_reference,issuer_role,executor_task_id,teardown_owner,
 backend_project_ref,source_sha,artifact_digest,configuration_digest,deployment_id,exact_origin,runtime_version,
 fixture_manifest_digest,identity_allowlist,allowed_capabilities,excluded_provider_actions,issued_at,expires_at)
values ('99000000-0000-4000-8000-000000000021',1,'internal_synthetic_assessment','ADR0008 owner approval','product_owner',
 '01a07739-9f14-73c0-8253-2da0e5576afe','product-reset-task','ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app',1,repeat('d',64),array['99000000-0000-4000-8000-000000000001']::uuid[],
 array['catalog','session','shopper_planning'],array['email','external_participants','media','routing','payments','public_activation'],statement_timestamp(),statement_timestamp()+interval '20 minutes');
alter role authenticator set pgrst.db_pre_request = 'app_public.internal_review_pre_request';
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000011"}',true);
select set_config('request.method','POST',true);
select set_config('request.headers','{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
select set_config('request.path','rpc/register_current_session',true);
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'owner registers actual provider session');
select ok(app_public.current_session_is_active(),'owner session initially active');
select set_config('request.path','rpc/create_trip',true);
select set_config('test.denial_trip',app_public.create_trip('Eligibility denial trip','2030-10-12')->>'id',true);
select ok(current_setting('test.denial_trip') is not null,'actual create reserves an owned trip');
select set_config('test.denial_version',app_public.get_trip(current_setting('test.denial_trip'))->>'version',true);
select set_config('request.path','rpc/add_trip_store_stop',true);
select lives_ok($$select app_public.internal_review_pre_request()$$,'owner has exact add admission');
select is(jsonb_array_length(app_public.add_trip_store_stop(current_setting('test.denial_trip'),'00000000-0000-4000-8000-000000001002')->'stops'),1,'positive control adds B');
reset role;
select is((select version from trip_private.trips where trip_id=current_setting('test.denial_trip')::uuid),current_setting('test.denial_version')::bigint+1,'positive add increments version exactly once');
-- A prior authoritative eligible-store read; this is not browser evidence.
select is((select count(*) from app_public.stores s join trip_private.trips t on t.area_id=s.area_id
 where t.trip_id=current_setting('test.denial_trip')::uuid and t.state in ('draft','ready')
 and s.id='00000000-0000-4000-8000-000000001001' and s.synthetic and s.audience='synthetic' and s.publication_state='active'),1::bigint,'A eligible before transition');
select is((select count(*) from trip_private.trip_stops where trip_id=current_setting('test.denial_trip')::uuid and store_id='00000000-0000-4000-8000-000000001001'),0::bigint,'A absent: duplicate cannot mask denial');
select is((select count(*) from trip_private.trip_stops where trip_id=current_setting('test.denial_trip')::uuid),1::bigint,'one stop: capacity cannot mask denial');
select is((select count(*) from trip_private.trip_stops where trip_id=current_setting('test.denial_trip')::uuid and store_id='00000000-0000-4000-8000-000000001002'),1::bigint,'positive control persisted exactly B');
select set_config('test.denial_snapshot',jsonb_build_object(
 'trip',(select to_jsonb(t) from trip_private.trips t where trip_id=current_setting('test.denial_trip')::uuid),
 'stops',(select coalesce(jsonb_agg(to_jsonb(s) order by stop_id),'[]'::jsonb) from trip_private.trip_stops s where trip_id=current_setting('test.denial_trip')::uuid))::text,true);
select set_config('test.denial_version',(select version::text from trip_private.trips where trip_id=current_setting('test.denial_trip')::uuid),true);
select ok(internal_review_private.planning_receipt('99000000-0000-4000-8000-000000000001') is not null,'planning receipt fresh');
update app_public.stores set publication_state='hidden' where id='00000000-0000-4000-8000-000000001001';
select is((select publication_state::text from app_public.stores where id='00000000-0000-4000-8000-000000001001'),'hidden','only current publication eligibility changed');
set local role authenticated;
select ok(app_public.current_session_is_active(),'unavailable case retains active session');
select set_config('request.path','rpc/get_trip',true);
select is(app_public.get_trip(current_setting('test.denial_trip'))->>'id',current_setting('test.denial_trip'),'unavailable case retains owned trip access');
select set_config('request.path','rpc/add_trip_store_stop',true);
select throws_ok($$select app_public.add_trip_store_stop(current_setting('test.denial_trip'),'00000000-0000-4000-8000-000000001001')$$,'P0001','store_stop_not_found','hidden A rejected at actual add RPC');
reset role;
select is(jsonb_build_object(
 'trip',(select to_jsonb(t) from trip_private.trips t where trip_id=current_setting('test.denial_trip')::uuid),
 'stops',(select coalesce(jsonb_agg(to_jsonb(s) order by stop_id),'[]'::jsonb) from trip_private.trip_stops s where trip_id=current_setting('test.denial_trip')::uuid)),current_setting('test.denial_snapshot')::jsonb,'unavailable denial preserves full trip and stop rows');
select is((select version from trip_private.trips where trip_id=current_setting('test.denial_trip')::uuid),current_setting('test.denial_version')::bigint,'unavailable denial preserves version');
update app_public.stores set publication_state='active' where id='00000000-0000-4000-8000-000000001001';
select is((select count(*) from app_public.stores s join trip_private.trips t on t.area_id=s.area_id
 where t.trip_id=current_setting('test.denial_trip')::uuid and t.state in ('draft','ready')
 and s.id='00000000-0000-4000-8000-000000001001' and s.synthetic and s.audience='synthetic' and s.publication_state='active'),1::bigint,'A fully eligible again before session revocation');
set local role authenticated;
select ok(app_public.current_session_is_active(),'same owner session active before revoke');
select set_config('request.path','rpc/get_trip',true);
select is(app_public.get_trip(current_setting('test.denial_trip'))->>'id',current_setting('test.denial_trip'),'same owner trip access before revoke');
select set_config('request.path','rpc/revoke_current_session',true);
select ok(app_public.revoke_current_session('test_add_denial'),'actual RPC revokes same claimed session');
select set_config('request.path','rpc/add_trip_store_stop',true);
select ok(not app_public.current_session_is_active(),'same claims now fail central active-session predicate');
select throws_ok($$select app_public.add_trip_store_stop(current_setting('test.denial_trip'),'00000000-0000-4000-8000-000000001001')$$,'P0001','authorization_lost','revoked same session rejected by add RPC itself');
reset role;
select is((select state::text from app_private.active_sessions where session_id='99000000-0000-4000-8000-000000000011' and user_id='99000000-0000-4000-8000-000000000001'),'revoked','exact actor/session row revoked');
select ok(internal_review_private.planning_receipt('99000000-0000-4000-8000-000000000001') is not null,'authorization receipt still fresh, not revoked');
select ok(internal_review_private.session_allowed('99000000-0000-4000-8000-000000000001'),'internal request context remains admitted');
select is((select publication_state::text from app_public.stores where id='00000000-0000-4000-8000-000000001001'),'active','store remains active during session denial');
select is(jsonb_build_object(
 'trip',(select to_jsonb(t) from trip_private.trips t where trip_id=current_setting('test.denial_trip')::uuid),
 'stops',(select coalesce(jsonb_agg(to_jsonb(s) order by stop_id),'[]'::jsonb) from trip_private.trip_stops s where trip_id=current_setting('test.denial_trip')::uuid)),current_setting('test.denial_snapshot')::jsonb,'revoked-session denial preserves full trip and stop rows');
select is((select version from trip_private.trips where trip_id=current_setting('test.denial_trip')::uuid),current_setting('test.denial_version')::bigint,'revoked-session denial preserves version');
select * from finish();
rollback;
