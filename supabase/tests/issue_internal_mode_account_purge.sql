-- #648: caller-shaped lifecycle proof under a persistent unrelated global binding.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
grant usage on schema extensions to anon,authenticated,service_role,account_lifecycle_service,authenticator,identity_service;

select ok(not has_table_privilege('account_lifecycle_service','trip_private.trips','DELETE'),'lifecycle direct deletion denied at baseline');

-- Fixtures and observations use the original privileged test runner; calls do not.
create temporary table purge_subjects as
select n, ('64800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid as id
from generate_series(1,8) n;
insert into auth.users(id) select id from purge_subjects;
insert into app_private.profiles(user_id,verified_email_snapshot,public_display_name,age_18_attested_at,last_authenticated_at,status)
select id,'purge-'||n||'@example.test','Purge fixture '||n,statement_timestamp(),statement_timestamp(),'active'
from purge_subjects on conflict(user_id) do update set age_18_attested_at=excluded.age_18_attested_at;
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date)
select ('64800000-0000-4000-8100-'||lpad((n*10+k)::text,12,'0'))::uuid,id,
 '00000000-0000-4000-8000-000000000001','Purge fixture '||n||'/'||k,'2030-10-12'
from purge_subjects cross join generate_series(1,3) k where n<>3;
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
select trip_id,owner_id,'creator' from trip_private.trips where trip_id::text like '64800000-0000-4000-8100-%';
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
values('64800000-0000-4000-8100-000000000022','64800000-0000-4000-8000-000000000001','partner');
insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version)
select trip_id,owner_id,decode(repeat('ab',32),'hex'),1 from trip_private.trips
where trip_id::text like '64800000-0000-4000-8100-%';
insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version)
values('64800000-0000-4000-8100-000000000022','64800000-0000-4000-8000-000000000001',decode(repeat('cd',32),'hex'),1);
update trip_private.trips set navigator_user_id='64800000-0000-4000-8000-000000000001',navigator_device_hash=decode(repeat('cd',32),'hex')
where trip_id='64800000-0000-4000-8100-000000000022';
insert into trip_private.trip_stops(trip_id,kind,store_id,position)
select trip_id,'store','00000000-0000-4000-8000-000000001001',0 from trip_private.trips where trip_id::text like '64800000-0000-4000-8100-%';
insert into trip_private.trip_create_receipts(actor_user_id,idempotency_key,payload_digest,trip_id)
select owner_id,trip_id,decode(repeat('ef',32),'hex'),trip_id from trip_private.trips where trip_id::text like '64800000-0000-4000-8100-%';
insert into shopper_private.saved_stores(user_id,store_id)
select id,'00000000-0000-4000-8000-000000001001' from purge_subjects where n<>3;
insert into shopper_private.private_store_memories(user_id,store_id,note)
select id,'00000000-0000-4000-8000-000000001001','Private fixture' from purge_subjects where n<>3;
insert into shopper_private.private_memory_deletions(user_id,store_id,source_version,note)
select id,'00000000-0000-4000-8000-000000001001',1,'Undo fixture' from purge_subjects where n<>3;
insert into app_private.account_deletion_requests(deletion_request_id,user_id,requested_at,due_at)
select id,id,statement_timestamp()-interval '2 days',statement_timestamp()-interval '1 day'
from purge_subjects where n in(1,8);
insert into app_private.account_deletion_requests(deletion_request_id,user_id,requested_at,due_at)
select id,id,statement_timestamp(),statement_timestamp()+interval '1 day'
from purge_subjects where n between 4 and 7;
set constraints all immediate;
set constraints all deferred;

select ok(app_public.request_user_id() is null and not internal_review_private.is_internal(null),'ordinary positive begins with unbound NULL context');

-- Claim both ordinary and internal-target requests through the actual worker role.
set local role account_lifecycle_service;
create temporary table purge_claims as select * from app_public.claim_due_account_deletions(statement_timestamp(),10);
select is((select count(*)::integer from purge_claims),2,'actual worker claims two due requests');
select is(app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000008',
 (select claim_token from purge_claims where user_id='64800000-0000-4000-8000-000000000008'),statement_timestamp())->>'state','prepared','ordinary lifecycle remains valid');
reset role;
select is((select count(*)::integer from trip_private.trips where owner_id='64800000-0000-4000-8000-000000000008'),0,'ordinary owned trips removed');
set constraints all immediate;
set constraints all deferred;

insert into internal_review_private.identities(user_id,alias,fixture_namespace,controlled_address)
values('64800000-0000-4000-8000-000000000003','shopper-a','review-reset-20260906','shopper-a@review-reset-20260906.invalid');
insert into internal_review_private.runtime_binding values
(1,'ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
'https://antique-trail-test-scott-marquis-projects.vercel.app','product-reset-task',statement_timestamp(),1);
select set_config('request.jwt.claims','{}',true);
select set_config('request.path','',true);
select ok(app_public.request_user_id() is null,'background request has no user');
select ok(internal_review_private.is_internal(null),'global binding makes NULL internal');
select is((select count(*)::integer from trip_private.trips where owner_id='64800000-0000-4000-8000-000000000001'),3,'privileged observer sees all three target trips before purge');
select is((select count(*)::integer from shopper_private.saved_stores where user_id='64800000-0000-4000-8000-000000000001'),1,'target shopper baseline visible');
select is((select count(*)::integer from shopper_private.private_store_memories where user_id='64800000-0000-4000-8000-000000000001'),1,'target memory baseline visible');
select is((select count(*)::integer from shopper_private.private_memory_deletions where user_id='64800000-0000-4000-8000-000000000001'),1,'target undo baseline visible');
select is((select count(*)::integer from trip_private.trip_stops where trip_id::text like '64800000-0000-4000-8100-00000000001%'),3,'target child baseline visible');
select is((select count(*)::integer from trip_private.trip_device_bindings where user_id='64800000-0000-4000-8000-000000000001'),4,'target device baseline includes surviving sibling binding');
select is((select count(*)::integer from trip_private.trip_create_receipts where actor_user_id='64800000-0000-4000-8000-000000000001'),3,'target keyed receipt baseline visible');
create temporary table sibling_before as select to_jsonb(t) as row from trip_private.trips t where trip_id='64800000-0000-4000-8100-000000000021';
create temporary table navigation_before as select to_jsonb(t)-array['navigator_user_id','navigator_device_hash','version','updated_at'] as row,version from trip_private.trips t where trip_id='64800000-0000-4000-8100-000000000022';
create temporary table sibling_children_before as select jsonb_build_object(
 'stops',(select jsonb_agg(to_jsonb(s) order by stop_id) from trip_private.trip_stops s where trip_id in('64800000-0000-4000-8100-000000000021','64800000-0000-4000-8100-000000000022')),
 'receipts',(select jsonb_agg(to_jsonb(r) order by idempotency_key) from trip_private.trip_create_receipts r where actor_user_id='64800000-0000-4000-8000-000000000002'),
 'participants',(select jsonb_agg(to_jsonb(p) order by trip_id) from trip_private.trip_participants p where user_id='64800000-0000-4000-8000-000000000002')) as row;

-- Every malformed shape below remains legal under the table constraints.
set local role account_lifecycle_service;
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000099',null,now())$$,'42501','account_deletion_claim_invalid','missing request denied');
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000001',null,now())$$,'42501','account_deletion_claim_invalid','NULL supplied token denied');
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000001',(select claim_token from purge_claims where user_id='64800000-0000-4000-8000-000000000008'),now())$$,'42501','account_deletion_claim_invalid','another request token denied');
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000004',null,now())$$,'42501','account_deletion_claim_invalid','future unclaimed NULL tokens denied');
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000004','64800000-0000-4000-8200-000000000004',now())$$,'42501','account_deletion_claim_invalid','NULL stored token and missing lease denied');
reset role;
update app_private.account_deletion_requests set requested_at=statement_timestamp()-interval '2 days',due_at=statement_timestamp()-interval '1 day' where deletion_request_id='64800000-0000-4000-8000-000000000004';
set local role account_lifecycle_service;
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000004',null,now())$$,'42501','account_deletion_claim_invalid','due unclaimed NULL tokens denied');
reset role;
update app_private.account_deletion_requests set requested_at=statement_timestamp(),due_at=statement_timestamp()+interval '1 day',claim_token='64800000-0000-4000-8200-000000000004',claimed_at=statement_timestamp(),lease_expires_at=statement_timestamp()+interval '5 minutes' where deletion_request_id='64800000-0000-4000-8000-000000000004';
set local role account_lifecycle_service;
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000004','64800000-0000-4000-8200-000000000004',now())$$,'42501','account_deletion_claim_invalid','fabricated live claim cannot authorize future purge');
reset role;
update app_private.account_deletion_requests set requested_at=statement_timestamp()-interval '2 days',due_at=statement_timestamp()-interval '1 day',lease_expires_at=statement_timestamp()-interval '1 second' where deletion_request_id='64800000-0000-4000-8000-000000000004';
set local role account_lifecycle_service;
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000004','64800000-0000-4000-8200-000000000004',now())$$,'42501','account_deletion_claim_invalid','expired lease denied');
reset role;
update app_private.account_deletion_requests set state='cancelled',cancelled_at=statement_timestamp(),lease_expires_at=statement_timestamp()+interval '5 minutes' where deletion_request_id='64800000-0000-4000-8000-000000000004';
set local role account_lifecycle_service;
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000004','64800000-0000-4000-8200-000000000004',now())$$,'42501','account_deletion_claim_invalid','cancelled request denied');
reset role;
select is((select count(*)::integer from trip_private.trips where owner_id='64800000-0000-4000-8000-000000000004'),3,'all invalid claims preserve target data');
select ok((select prepared_at is null from app_private.account_deletion_requests where deletion_request_id='64800000-0000-4000-8000-000000000004'),'invalid claims never prepare');

-- Exceptions and silently suppressed DELETEs must roll back earlier shopper work.
create function pg_temp.purge_delete_probe() returns trigger language plpgsql as $$
begin
 if old.owner_id='64800000-0000-4000-8000-000000000001' then
  if current_setting('test.purge_suppress',true)='yes' then return null; end if;
  raise exception using errcode='P0001',message='purge_test_delete_failure';
 end if;
 return old;
end $$;
create trigger purge_delete_probe before delete on trip_private.trips for each row execute function pg_temp.purge_delete_probe();
set local role account_lifecycle_service;
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000001',(select claim_token from purge_claims where user_id='64800000-0000-4000-8000-000000000001'),now())$$,'P0001','purge_test_delete_failure','delete error aborts prepare');
select set_config('test.purge_suppress','yes',true);
select throws_ok($$select app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000001',(select claim_token from purge_claims where user_id='64800000-0000-4000-8000-000000000001'),now())$$,'55000','account_purge_incomplete','residual rows abort prepare');
reset role;
set local role account_lifecycle_service;
select throws_ok($$delete from trip_private.trips where trip_id='64800000-0000-4000-8100-000000000021'$$,'42501',null,'failed helper leaves no direct deletion privilege');
reset role;
select is((select count(*)::integer from shopper_private.saved_stores where user_id='64800000-0000-4000-8000-000000000001'),1,'both failures roll back preceding shopper delete');
select is((select count(*)::integer from trip_private.trips where owner_id='64800000-0000-4000-8000-000000000001'),3,'both failures preserve target trips');
select ok((select prepared_at is null from app_private.account_deletion_requests where deletion_request_id='64800000-0000-4000-8000-000000000001'),'failed purge never marked prepared');
drop trigger purge_delete_probe on trip_private.trips;

set local role account_lifecycle_service;
-- Timestamp captured in the SAME statement as the operation.
create temporary table prepared_result as select statement_timestamp() as prepared_clock,
 app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000001',(select claim_token from purge_claims where user_id='64800000-0000-4000-8000-000000000001'),now()) as result;
select is((select result->>'state' from prepared_result),'prepared','actual claim prepares in internal mode');
select is(app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000001',(select claim_token from purge_claims where user_id='64800000-0000-4000-8000-000000000001'),now())->>'state','prepared','valid prepared retry is harmless');
reset role;
select is((select count(*)::integer from trip_private.trips where owner_id='64800000-0000-4000-8000-000000000001'),0,'target trips three to zero under global binding');
select is((select count(*)::integer from trip_private.trip_stops where trip_id::text like '64800000-0000-4000-8100-00000000001%'),0,'owned child stops cascade');
select is((select count(*)::integer from trip_private.trip_device_bindings where user_id='64800000-0000-4000-8000-000000000001'),0,'target device bindings removed');
select is((select count(*)::integer from trip_private.trip_participants where user_id='64800000-0000-4000-8000-000000000001'),0,'owned and sibling participation removed');
select is((select count(*)::integer from trip_private.trip_create_receipts where actor_user_id='64800000-0000-4000-8000-000000000001'),0,'target keyed receipts cascade with profile');
select is((select count(*)::integer from app_private.profiles where user_id='64800000-0000-4000-8000-000000000001'),0,'target profile removed');
select is((select count(*)::integer from shopper_private.saved_stores where user_id='64800000-0000-4000-8000-000000000001'),0,'target saves removed');
select is((select count(*)::integer from shopper_private.private_store_memories where user_id='64800000-0000-4000-8000-000000000001'),0,'target memories removed');
select is((select count(*)::integer from shopper_private.private_memory_deletions where user_id='64800000-0000-4000-8000-000000000001'),0,'target undo rows removed');
select is((select to_jsonb(t) from trip_private.trips t where trip_id='64800000-0000-4000-8100-000000000021'),(select row from sibling_before),'unaffected sibling byte content unchanged');
select is((select to_jsonb(t)-array['navigator_user_id','navigator_device_hash','version','updated_at'] from trip_private.trips t where trip_id='64800000-0000-4000-8100-000000000022'),(select row from navigation_before),'navigation cleanup preserves every other trip field');
select ok((select navigator_user_id is null and navigator_device_hash is null and version=(select version+1 from navigation_before) and updated_at=(select prepared_clock from prepared_result) from trip_private.trips where trip_id='64800000-0000-4000-8100-000000000022'),'navigator cleared with exactly one version increment and database timestamp');
select is(jsonb_build_object(
 'stops',(select jsonb_agg(to_jsonb(s) order by stop_id) from trip_private.trip_stops s where trip_id in('64800000-0000-4000-8100-000000000021','64800000-0000-4000-8100-000000000022')),
 'receipts',(select jsonb_agg(to_jsonb(r) order by idempotency_key) from trip_private.trip_create_receipts r where actor_user_id='64800000-0000-4000-8000-000000000002'),
 'participants',(select jsonb_agg(to_jsonb(p) order by trip_id) from trip_private.trip_participants p where user_id='64800000-0000-4000-8000-000000000002')),(select row from sibling_children_before),'sibling children receipts and other participants unchanged');
select ok(exists(select 1 from internal_review_private.runtime_binding),'unrelated global binding persists');
set constraints all immediate;
set constraints all deferred;
set local role account_lifecycle_service;
select is(app_public.complete_account_deletion('64800000-0000-4000-8000-000000000001',(select claim_token from purge_claims where user_id='64800000-0000-4000-8000-000000000001'),now())->>'state','completed','completion remains compatible');
select is(app_public.prepare_account_deletion('64800000-0000-4000-8000-000000000001',null,now())->>'state','completed','completed retry permits cleared tokens');
reset role;

-- Restored request need not be completed: receipt controls restore replay.
insert into app_private.deletion_receipts(deletion_request_id,outcome,expires_at)
values('64800000-0000-4000-8000-000000000004','completed',statement_timestamp()+interval '1 day'),
 ('64800000-0000-4000-8000-000000000005','completed',statement_timestamp()-interval '1 day'),
 ('64800000-0000-4000-8000-000000000006','failed',statement_timestamp()+interval '1 day');
set local role account_lifecycle_service;
select is(app_public.replay_account_deletion_receipts(now(),25),1,'unexpired completion receipt replays cancelled restored request');
select is(app_public.replay_account_deletion_receipts(now(),25),0,'replay clears subject and repeats zero');
reset role;
select ok((select user_id is null from app_private.account_deletion_requests where deletion_request_id='64800000-0000-4000-8000-000000000004'),'replay clears restored subject');
select is((select count(*)::integer from trip_private.trips where owner_id='64800000-0000-4000-8000-000000000004'),0,'replay truly purges rows');
select is((select count(*)::integer from trip_private.trips where owner_id in('64800000-0000-4000-8000-000000000005','64800000-0000-4000-8000-000000000006','64800000-0000-4000-8000-000000000007')),9,'expired failed and missing receipts preserve data');
set constraints all immediate;

-- New authority is unreachable from runtime callers, even with forged claims.
select set_config('request.jwt.claims','{"sub":"64800000-0000-4000-8000-000000000003","role":"account_purge_executor"}',true);
select set_config('request.path','rpc/purge_internal_owned_trips',true);
select set_config('app.account_purge_executor','true',true);

set local role anon;
select throws_ok($$select app_private.purge_internal_shopper_rows('64800000-0000-4000-8000-000000000002')$$,'42501',null,'anon cannot invoke purge_internal_shopper_rows');
select throws_ok($$select app_private.purge_internal_owned_trips('64800000-0000-4000-8000-000000000002')$$,'42501',null,'anon cannot invoke purge_internal_owned_trips');
select throws_ok($$select app_private.purge_internal_trip_participation('64800000-0000-4000-8000-000000000002')$$,'42501',null,'anon cannot invoke purge_internal_trip_participation');
reset role;
select ok(not pg_has_role('anon','account_purge_executor','MEMBER'),'anon has no executor membership');
set local role authenticated;
select throws_ok($$select app_private.purge_internal_shopper_rows('64800000-0000-4000-8000-000000000002')$$,'42501',null,'authenticated cannot invoke purge_internal_shopper_rows');
select throws_ok($$select app_private.purge_internal_owned_trips('64800000-0000-4000-8000-000000000002')$$,'42501',null,'authenticated cannot invoke purge_internal_owned_trips');
select throws_ok($$select app_private.purge_internal_trip_participation('64800000-0000-4000-8000-000000000002')$$,'42501',null,'authenticated cannot invoke purge_internal_trip_participation');
reset role;
select ok(not pg_has_role('authenticated','account_purge_executor','MEMBER'),'authenticated has no executor membership');
set local role service_role;
select throws_ok($$select app_private.purge_internal_shopper_rows('64800000-0000-4000-8000-000000000002')$$,'42501',null,'service_role cannot invoke purge_internal_shopper_rows');
select throws_ok($$select app_private.purge_internal_owned_trips('64800000-0000-4000-8000-000000000002')$$,'42501',null,'service_role cannot invoke purge_internal_owned_trips');
select throws_ok($$select app_private.purge_internal_trip_participation('64800000-0000-4000-8000-000000000002')$$,'42501',null,'service_role cannot invoke purge_internal_trip_participation');
reset role;
select ok(not pg_has_role('service_role','account_purge_executor','MEMBER'),'service_role has no executor membership');
set local role account_lifecycle_service;
select throws_ok($$select app_private.purge_internal_shopper_rows('64800000-0000-4000-8000-000000000002')$$,'42501',null,'account_lifecycle_service cannot invoke purge_internal_shopper_rows');
select throws_ok($$select app_private.purge_internal_owned_trips('64800000-0000-4000-8000-000000000002')$$,'42501',null,'account_lifecycle_service cannot invoke purge_internal_owned_trips');
select throws_ok($$select app_private.purge_internal_trip_participation('64800000-0000-4000-8000-000000000002')$$,'42501',null,'account_lifecycle_service cannot invoke purge_internal_trip_participation');
reset role;
select ok(not pg_has_role('account_lifecycle_service','account_purge_executor','MEMBER'),'account_lifecycle_service has no executor membership');
set local role authenticator;
select throws_ok($$select app_private.purge_internal_shopper_rows('64800000-0000-4000-8000-000000000002')$$,'42501',null,'authenticator cannot invoke purge_internal_shopper_rows');
select throws_ok($$select app_private.purge_internal_owned_trips('64800000-0000-4000-8000-000000000002')$$,'42501',null,'authenticator cannot invoke purge_internal_owned_trips');
select throws_ok($$select app_private.purge_internal_trip_participation('64800000-0000-4000-8000-000000000002')$$,'42501',null,'authenticator cannot invoke purge_internal_trip_participation');
reset role;
select ok(not pg_has_role('authenticator','account_purge_executor','MEMBER'),'authenticator has no executor membership');
select ok((select not rolcanlogin and not rolinherit and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls from pg_roles where rolname='account_purge_executor'),'executor has no login or bypass authority');
select is((select count(*)::integer from pg_auth_members where roleid='account_purge_executor'::regrole or member='account_purge_executor'::regrole),0,'executor has no inbound or outbound membership');
select ok(not has_schema_privilege('account_purge_executor','app_private','CREATE'),'executor has no schema CREATE');
select ok(not has_table_privilege('account_purge_executor','trip_private.trips','INSERT') and not has_column_privilege('account_purge_executor','trip_private.trips','name','UPDATE'),'executor cannot insert or edit unrelated trip columns');
select ok(not has_table_privilege('account_purge_executor','trip_private.trip_device_bindings','SELECT'),'executor receives no child-table grant');
select ok((select bool_and(prosecdef and proowner='account_purge_executor'::regrole and proconfig=array['search_path=""']) from pg_proc where oid in('app_private.purge_internal_shopper_rows(uuid)'::regprocedure,'app_private.purge_internal_owned_trips(uuid)'::regprocedure,'app_private.purge_internal_trip_participation(uuid)'::regprocedure)),'helper owner definer and empty path fixed');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in('app_private.purge_internal_shopper_rows(uuid)'::regprocedure,'app_private.purge_internal_owned_trips(uuid)'::regprocedure,'app_private.purge_internal_trip_participation(uuid)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE'),'no PUBLIC helper EXECUTE');
select ok(has_function_privilege('identity_service','app_private.purge_internal_owned_trips(uuid)','EXECUTE'),'identity-service intentional private caller retained');
set local role identity_service;
select throws_ok($$select app_private.purge_internal_owned_trips(null)$$,'22023','account_deletion_subject_required','NULL helper subject rejected');
reset role;
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in('shopper_private.saved_stores'::regclass,'shopper_private.private_store_memories'::regclass,'shopper_private.private_memory_deletions'::regclass,'trip_private.trips'::regclass,'trip_private.trip_participants'::regclass)),'all five tables retain FORCE RLS');
select ok(exists(select 1 from internal_review_private.runtime_binding),'global binding still present at finish');
select set_config('request.jwt.claims','{}',true);
select set_config('request.path','',true);
set constraints all immediate;
set local role account_lifecycle_service;
select throws_ok($$delete from trip_private.trips where trip_id='64800000-0000-4000-8100-000000000021'$$,'42501',null,'successful helper leaves no direct deletion privilege');
select throws_ok($$select app_private.purge_internal_owned_trips('64800000-0000-4000-8000-000000000002')$$,'42501',null,'NULL actor cannot gain helper access');
reset role;
select set_config('request.jwt.claims','{"sub":"64800000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('request.path','rpc/wrong_route',true);
set local role authenticated;
select throws_ok($$select app_public.create_trip('Denied fixture','2030-10-12','64800000-0000-4000-8300-000000000001')$$,'P0001','authorization_lost','forged actor wrong route keeps original session denial');
select set_config('request.path','',true);
select throws_ok($$select app_public.create_trip('Denied fixture','2030-10-12','64800000-0000-4000-8300-000000000002')$$,'P0001','authorization_lost','missing route does not authorize forged actor');
reset role;
select is((select count(*)::integer from trip_private.trips where name='Denied fixture'),0,'denied routes write no fixture trips');
select set_config('request.jwt.claims','{}',true);
set constraints all immediate;
select * from finish();
rollback;
