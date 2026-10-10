begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant identity_service, public_catalog_gateway to postgres;
grant usage on schema extensions to authenticated, public_catalog_gateway;
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql;return false;exception when insufficient_privilege then return true;end $$;

insert into auth.users(id) values
 ('99000000-0000-4000-8000-000000000001'),('99000000-0000-4000-8000-000000000002');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('99000000-0000-4000-8000-000000000011','99000000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
 ('99000000-0000-4000-8000-000000000012','99000000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp());
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at) values
 ('99000000-0000-4000-8000-000000000001','nearby-a@review.invalid',statement_timestamp()),
 ('99000000-0000-4000-8000-000000000002','nearby-b@review.invalid',statement_timestamp())
on conflict(user_id) do update set status='active',verified_email_snapshot=excluded.verified_email_snapshot,
 age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id,role,state) values
 ('99000000-0000-4000-8000-000000000001','shopper','active'),
 ('99000000-0000-4000-8000-000000000002','shopper','active');
update app_private.environment_stage set stage='synthetic_alpha',
 receipt_id='99000000-0000-4000-8000-000000000031',capabilities=capabilities||'{"private_auth":true}'::jsonb where id=1;
update app_private.account_registration_config set mode='receipt_only',
 stage_receipt_id='99000000-0000-4000-8000-000000000031' where id=1;
update app_private.registration_quarantine_latch set state='open',blocked_at=null where id=1;
reset role;

alter role authenticator set pgrst.db_pre_request = 'app_public.internal_review_pre_request';

select set_config('request.method','POST',true);
select set_config('request.headers','{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
select set_config('request.path','rpc/register_current_session',true);
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select lives_ok($$select app_public.internal_review_pre_request()$$,'installed guard admits A registration request');
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'A registers real provider session');
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000012"}',true);
select lives_ok($$select app_public.internal_review_pre_request()$$,'installed guard admits B registration request');
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'B registers real provider session');
reset role;

insert into app_public.catalog_areas(id,slug,label,state_code)
values('99000000-0000-4000-8000-000000006350','issue-644-synth','Issue 644 Region','KS');
insert into app_public.store_categories(id,slug,label)
values('99000000-0000-4000-8000-000000006351','issue-644-synth','Nearby Fixture');
insert into app_public.stores(id,synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,latitude,longitude,summary,description)
values
 ('99000000-0000-4000-8000-000000007101',true,'synthetic','active','nearby-644-7101','Nearby Boundary 7101','Fixture Town','KS','1 Test Street','99000000-0000-4000-8000-000000006350',0,0,'Issue 644 fixture','Synthetic gateway fixture.'),
 ('99000000-0000-4000-8000-000000007102',true,'synthetic','active','nearby-644-7102','Nearby Boundary 7102','Fixture Town','KS','2 Test Street','99000000-0000-4000-8000-000000006350',0,0.001,'Issue 644 fixture','Synthetic gateway fixture.');
insert into app_public.store_category_assignments(store_id,category_id)
select s.id,'99000000-0000-4000-8000-000000006351' from app_public.stores s where s.id in
 ('99000000-0000-4000-8000-000000007101','99000000-0000-4000-8000-000000007102');
insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
select s.id,g.group_name,statement_timestamp()-interval '20 days','Issue 644 synthetic fixture','two_person_public_source'
from app_public.stores s cross join (values('identity_location'::app_public.verification_group),('contact'),('hours'),('categories_attributes'))g(group_name)
where s.id in ('99000000-0000-4000-8000-000000007101','99000000-0000-4000-8000-000000007102');

select ok(has_schema_privilege('anon','app_public','USAGE')
 and has_schema_privilege('authenticated','app_public','USAGE')
 and has_schema_privilege('service_role','app_public','USAGE')
 and has_schema_privilege('public_catalog_gateway','app_public','USAGE'),
 'caller roles can resolve app_public for effective EXECUTE checks');
set local role anon;
select ok(pg_temp.denied($$select app_public.synthetic_catalog_gateway_request(repeat('0',64),null,null,'nearby-list','{}')$$),
 'actual anon wrapper call is denied');
select ok(pg_temp.denied($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,0,0,5)$$),
 'actual anon base-reader call is denied');
reset role;
set local role authenticated;
select ok(pg_temp.denied($$select app_public.synthetic_catalog_gateway_request(repeat('0',64),null,null,'nearby-list','{}')$$),
 'actual authenticated wrapper call is denied');
select ok(pg_temp.denied($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,0,0,5)$$),
 'actual authenticated base-reader call is denied');
reset role;
set local role service_role;
select ok(pg_temp.denied($$select app_public.synthetic_catalog_gateway_request(repeat('0',64),null,null,'nearby-list','{}')$$),
 'actual service_role wrapper call is denied');
reset role;
set local role public_catalog_gateway;
select ok(pg_temp.denied($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,0,0,5)$$),
 'actual public gateway base-reader call is denied');
reset role;

select ok(not has_function_privilege('anon','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
 and not has_function_privilege('authenticated','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
 and not has_function_privilege('service_role','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
 and has_function_privilege('public_catalog_gateway','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE'),
 'only constrained gateway role can execute wrapper');
select ok((select prosecdef and provolatile='v' and 'search_path=""'=any(coalesce(proconfig,'{}'))
 and pg_get_userbyid(proowner)='synthetic_catalog_automation'
 from pg_proc where oid='app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)'::regprocedure)
 and not has_function_privilege('public_catalog_gateway',
 'app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),
 'wrapper owner/settings stay fixed and gateway cannot invoke reader directly');
select ok(not exists(select 1 from internal_review_private.identities where user_id='99000000-0000-4000-8000-000000000002')
 and not internal_review_private.is_internal('99000000-0000-4000-8000-000000000002')
 and internal_review_private.session_allowed('99000000-0000-4000-8000-000000000002'),
 'B registration and ordinary request run before any internal binding');
select set_config('request.path','rpc/synthetic_catalog_gateway_request',true);
select set_config('request.jwt.claims','{"role":"public_catalog_gateway"}',true);
set local role public_catalog_gateway;
select lives_ok($$select app_public.internal_review_pre_request()$$,'gateway request context passes installed guard');
select is((select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(app_public.synthetic_catalog_gateway_request(
 repeat('e',64),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":"Nearby Boundary","p_category":"issue-644-synth","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}'::jsonb)) x),
 array['99000000-0000-4000-8000-000000007101'::uuid,'99000000-0000-4000-8000-000000007102'::uuid],'ordinary alpha shopper receives both qualifying rows');
select ok((app_public.synthetic_catalog_gateway_request(repeat('d',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}'::jsonb)) is not null,
 'explicit null query/category/area dispatch');
reset role;
grant release_automation to postgres;
select lives_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
set local role release_automation;
insert into release_private.public_catalog_rate_windows values(decode(repeat('ab',32),'hex'),'nearby-list',v_window,59);
reset role;
set local role public_catalog_gateway;
perform app_public.synthetic_catalog_gateway_request(repeat('ab',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}'::jsonb);
reset role;
set local role release_automation;
if not exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('ab',32),'hex') and operation='nearby-list' and window_start=v_window and request_count=60) then raise exception 'nearby-list expected count 60'; end if;
reset role;
end
$block$;
$test$,'nearby-list admits request 60 and persists count 60');
reset role;
select throws_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
set local role release_automation;
insert into release_private.public_catalog_rate_windows values(decode(repeat('bc',32),'hex'),'nearby-list',v_window,60);
reset role;
set local role public_catalog_gateway;
perform app_public.synthetic_catalog_gateway_request(repeat('bc',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}'::jsonb);

end
$block$;
$test$,'P0001','catalog_rate_limited','nearby-list request 61 is rate limited');
reset role;
select lives_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
set local role release_automation;
insert into release_private.public_catalog_rate_windows values(decode(repeat('cd',32),'hex'),'list',v_window,59);
reset role;
set local role public_catalog_gateway;
perform app_public.synthetic_catalog_gateway_request(repeat('cd',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','list','{}'::jsonb);
reset role;
set local role release_automation;
if not exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('cd',32),'hex') and operation='list' and window_start=v_window and request_count=60) then raise exception 'list expected count 60'; end if;
reset role;
end
$block$;
$test$,'list admits request 60 and persists count 60');
reset role;
select throws_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
set local role release_automation;
insert into release_private.public_catalog_rate_windows values(decode(repeat('de',32),'hex'),'list',v_window,60);
reset role;
set local role public_catalog_gateway;
perform app_public.synthetic_catalog_gateway_request(repeat('de',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','list','{}'::jsonb);

end
$block$;
$test$,'P0001','catalog_rate_limited','list request 61 is rate limited');
reset role;
select lives_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
set local role release_automation;
insert into release_private.public_catalog_rate_windows values(decode(repeat('ef',32),'hex'),'details',v_window,119);
reset role;
set local role public_catalog_gateway;
perform app_public.synthetic_catalog_gateway_request(repeat('ef',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','details','{"p_slug":"nearby-644-7101"}'::jsonb);
reset role;
set local role release_automation;
if not exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('ef',32),'hex') and operation='details' and window_start=v_window and request_count=120) then raise exception 'details expected count 120'; end if;
reset role;
end
$block$;
$test$,'details admits request 120 and persists count 120');
reset role;
select throws_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
set local role release_automation;
insert into release_private.public_catalog_rate_windows values(decode(repeat('fa',32),'hex'),'details',v_window,120);
reset role;
set local role public_catalog_gateway;
perform app_public.synthetic_catalog_gateway_request(repeat('fa',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','details','{"p_slug":"nearby-644-7101"}'::jsonb);

end
$block$;
$test$,'P0001','catalog_rate_limited','details request 121 is rate limited');
reset role;
select lives_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
set local role release_automation;
insert into release_private.public_catalog_rate_windows values(decode(repeat('12',32),'hex'),'nearby-list',v_window-interval '5 minutes',60);
reset role;
set local role public_catalog_gateway;
perform app_public.synthetic_catalog_gateway_request(repeat('12',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}'::jsonb);
reset role;
set local role release_automation;
if not exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('12',32),'hex') and operation='nearby-list' and window_start=v_window-interval '5 minutes' and request_count=60) or not exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('12',32),'hex') and operation='nearby-list' and window_start=v_window and request_count=1) then raise exception 'rollover row isolation failed'; end if;
reset role;
end
$block$;
$test$,'exhausted prior window does not exhaust current Nearby window');
reset role;
select lives_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
set local role release_automation;
insert into release_private.public_catalog_rate_windows values(decode(repeat('23',32),'hex'),'nearby-list',v_window,60),(decode(repeat('23',32),'hex'),'details',v_window,1);
reset role;
set local role public_catalog_gateway;
perform app_public.synthetic_catalog_gateway_request(repeat('23',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','details','{"p_slug":"nearby-644-7101"}'::jsonb);
reset role;
set local role release_automation;
if not exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('23',32),'hex') and operation='nearby-list' and window_start=v_window and request_count=60) or not exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('23',32),'hex') and operation='details' and window_start=v_window and request_count=2) then raise exception 'operation counters mixed'; end if;
reset role;
end
$block$;
$test$,'details budget stays separate from Nearby for one rate key');
reset role;
select lives_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300); v_message text; v_denied boolean:=false;
begin
set local role public_catalog_gateway;
begin
perform app_public.synthetic_catalog_gateway_request(repeat('34',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000011','nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}'::jsonb);
exception when sqlstate '42501' then get stacked diagnostics v_message=message_text; if v_message<>'synthetic_catalog_forbidden' then raise exception 'unexpected denial: %',v_message; end if; v_denied:=true;
end;
reset role;
if not v_denied then raise exception 'cross-session request was not denied'; end if;
set local role release_automation;
if exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('34',32),'hex') and operation='nearby-list' and window_start=v_window) then raise exception 'denied request created rate row'; end if;
reset role;
end
$block$;
$test$,'cross-session denial creates no rate row');
reset role;
select lives_ok($test$
do $block$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300); v_message text; v_denied boolean:=false; v_count integer;
begin
set local role release_automation;
insert into release_private.public_catalog_rate_windows values(decode(repeat('45',32),'hex'),'nearby-list',v_window,17);
reset role;
set local role public_catalog_gateway;
begin
perform app_public.synthetic_catalog_gateway_request(repeat('45',32),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000011','nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}'::jsonb);
exception when sqlstate '42501' then get stacked diagnostics v_message=message_text; if v_message<>'synthetic_catalog_forbidden' then raise exception 'unexpected denial: %',v_message; end if; v_denied:=true;
end;
reset role;
if not v_denied then raise exception 'cross-session request was not denied'; end if;
set local role release_automation;
select request_count into v_count from release_private.public_catalog_rate_windows where key_hash=decode(repeat('45',32),'hex') and operation='nearby-list' and window_start=v_window;
if v_count is distinct from 17 then raise exception 'denied request changed rate count from 17'; end if;
reset role;
end
$block$;
$test$,'cross-session denial leaves existing rate count unchanged');
reset role;
revoke release_automation from postgres;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','gateway_request_invalid','missing p_q is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','gateway_request_invalid','missing p_category is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','gateway_request_invalid','missing p_area is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','gateway_request_invalid','missing latitude is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_radius_miles":5}')$$,
 'P0001','gateway_request_invalid','missing longitude is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0}')$$,
 'P0001','gateway_request_invalid','missing radius is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5,"p_store_id":"99000000-0000-4000-8000-000000007101"}')$$,
 'P0001','gateway_request_invalid','forged p_store_id is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":null,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','explicit null latitude is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":null,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','explicit null longitude is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":"0","p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','string longitude is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":"5"}')$$,
 'P0001','invalid_nearby_input','string radius is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":"NaN","p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','string NaN coordinate is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":"Infinity","p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','string Infinity coordinate is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":"x","p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5,"extra":true}')$$,
 'P0001','gateway_request_invalid','unknown arguments fail closed');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(null,
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list','{}')$$,
 'P0001','gateway_request_invalid','null rate key is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012',null,'{}')$$,
 'P0001','gateway_request_invalid','null operation is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','other','{}')$$,
 'P0001','gateway_request_invalid','unknown operation is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list','null'::jsonb)$$,
 'P0001','gateway_request_invalid','null args are rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list','[]'::jsonb)$$,
 'P0001','gateway_request_invalid','array args are rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list','1'::jsonb)$$,
 'P0001','gateway_request_invalid','scalar args are rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5,"actor_id":"99000000-0000-4000-8000-000000000001"}')$$,
 'P0001','gateway_request_invalid','forged actor argument is rejected');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":181,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','longitude upper bound is denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":-181,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','longitude lower bound is denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":7,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','wrong query type is denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":7,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','wrong category type is denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('b',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','another registered actor session is denied');
reset role;
set local role identity_service;
update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp()
where user_id='99000000-0000-4000-8000-000000000002' and session_id='99000000-0000-4000-8000-000000000012';
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('0',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','revoked registered session is denied');
reset role;
set local role identity_service;
update app_private.active_sessions set state='active',revoked_at=null
where user_id='99000000-0000-4000-8000-000000000002' and session_id='99000000-0000-4000-8000-000000000012';
reset role;
set local role identity_service;
update app_private.active_sessions set state='expired',revoked_at=statement_timestamp()
where user_id='99000000-0000-4000-8000-000000000002' and session_id='99000000-0000-4000-8000-000000000012';
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('1',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','expired registered session is denied');
reset role;
set local role identity_service;
update app_private.active_sessions set state='active',revoked_at=null,
 access_token_expires_at=statement_timestamp()+interval '1 hour'
where user_id='99000000-0000-4000-8000-000000000002' and session_id='99000000-0000-4000-8000-000000000012';
reset role;
set local role identity_service;
update app_private.active_sessions set access_token_expires_at=statement_timestamp()-interval '1 second'
where user_id='99000000-0000-4000-8000-000000000002' and session_id='99000000-0000-4000-8000-000000000012';
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('2',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','expired access token on registered session is denied');
reset role;
set local role identity_service;
update app_private.active_sessions set access_token_expires_at=statement_timestamp()+interval '1 hour'
where user_id='99000000-0000-4000-8000-000000000002' and session_id='99000000-0000-4000-8000-000000000012';
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('a',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','map','{}')$$,
 '42501','synthetic_catalog_map_disabled','synthetic map remains disabled');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('6',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":7}')$$,
 'P0001','invalid_nearby_input','unsupported radius is denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('5',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":91,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','out-of-range coordinates are denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request('bad',
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','gateway_request_invalid','malformed rate key is denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('3',64),
 null,'99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','missing actor is denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('2',64),
 '99000000-0000-4000-8000-000000000002',null,'nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','missing session is denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('1',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":"unexpected","p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','non-null area is denied');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('0',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":"0","p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','invalid_nearby_input','string coordinate is denied');
set local role identity_service;
update app_private.account_registration_config set stage_receipt_id='99000000-0000-4000-8000-000000000099' where id=1;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('a',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_evidence_invalid','mismatched ordinary stage receipt is denied');
reset role;
set local role identity_service;
update app_private.account_registration_config set stage_receipt_id='99000000-0000-4000-8000-000000000031' where id=1;
reset role;
set local role identity_service;
update app_private.environment_stage set receipt_id=null where id=1;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('6',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_evidence_invalid','null ordinary stage receipt is denied');
reset role;
set local role identity_service;
update app_private.environment_stage set receipt_id='99000000-0000-4000-8000-000000000031' where id=1;
update app_private.environment_stage set capabilities=capabilities-'private_auth' where id=1;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('7',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_evidence_invalid','absent private_auth capability is denied');
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities=capabilities||'{"private_auth":true}'::jsonb where id=1;
update app_private.account_registration_config set mode='public' where id=1;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('8',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_evidence_invalid','wrong ordinary registration mode is denied');
reset role;
set local role identity_service;
update app_private.account_registration_config set mode='receipt_only' where id=1;
reset role;
set local role public_catalog_gateway;
select is((select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(app_public.synthetic_catalog_gateway_request(
 repeat('1',64),'99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":"Nearby Boundary","p_category":"issue-644-synth","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}'::jsonb)) x),
 array['99000000-0000-4000-8000-000000007101'::uuid,'99000000-0000-4000-8000-000000007102'::uuid],
 'restored ordinary gate mutations preserve B positive');
reset role;
set local role identity_service;
update app_private.registration_quarantine_latch set state='blocked',blocked_at=statement_timestamp() where id=1;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('b',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_evidence_invalid','closed quarantine latch denies ordinary shopper');
reset role;
set local role identity_service;
update app_private.registration_quarantine_latch set state='open',blocked_at=null where id=1;
update app_private.profiles set status='deletion_scheduled',deletion_due_at=statement_timestamp()+interval '1 day'
where user_id='99000000-0000-4000-8000-000000000002';
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('c',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','inactive profile is denied');
reset role;
grant delete on app_private.role_grants to identity_service;
set local role identity_service;
update app_private.profiles set status='active',deletion_due_at=null where user_id='99000000-0000-4000-8000-000000000002';
delete from app_private.role_grants
where subject_user_id='99000000-0000-4000-8000-000000000002' and role='shopper' and store_id is null;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('3',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','absent global Shopper grant is denied');
reset role;
set local role identity_service;
insert into app_private.role_grants(subject_user_id,role,state)
values ('99000000-0000-4000-8000-000000000002','shopper','active');
update app_private.role_grants set state='revoked',revoked_at=statement_timestamp()
where subject_user_id='99000000-0000-4000-8000-000000000002' and role='shopper' and store_id is null;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('d',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','inactive global Shopper grant is denied');
reset role;
set local role identity_service;
update app_private.role_grants set state='active',revoked_at=null
where subject_user_id='99000000-0000-4000-8000-000000000002' and role='shopper' and store_id is null;
delete from app_private.role_grants
where subject_user_id='99000000-0000-4000-8000-000000000002' and role='shopper' and store_id is null;
select ok(app_private.privileged_anchor_is_current(),
 'current local audit anchor permits isolated privileged-role fixtures');
insert into app_private.role_grants(subject_user_id,role,state)
values ('99000000-0000-4000-8000-000000000002','administrator','active');
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('4',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','non-Shopper-only global grant is denied');
reset role;
set local role identity_service;
delete from app_private.role_grants
where subject_user_id='99000000-0000-4000-8000-000000000002' and role='administrator' and store_id is null;
insert into app_private.role_grants(subject_user_id,role,store_id,state)
values ('99000000-0000-4000-8000-000000000002','representative','99000000-0000-4000-8000-000000007101','active');
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('5',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','store-scoped Representative-only grant is denied');
reset role;
set local role identity_service;
delete from app_private.role_grants
where subject_user_id='99000000-0000-4000-8000-000000000002' and role='representative' and store_id='99000000-0000-4000-8000-000000007101';
insert into app_private.role_grants(subject_user_id,role,state)
values ('99000000-0000-4000-8000-000000000002','shopper','active');
reset role;
revoke delete on app_private.role_grants from identity_service;

insert into internal_review_private.identities(user_id,alias,fixture_namespace,controlled_address)
values ('99000000-0000-4000-8000-000000000001','shopper-a','review-reset-20260906','shopper-a@review-reset-20260906.invalid');
insert into internal_review_private.runtime_binding values
 (1,'ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app','product-reset-task',statement_timestamp(),1);
select set_config('request.path','rpc/synthetic_catalog_gateway_request',true);
select set_config('request.method','POST',true);
select set_config('request.jwt.claims','{"role":"public_catalog_gateway"}',true);
select set_config('request.headers','{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('f',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','missing internal receipt denies bound A');
reset role;
insert into internal_review_private.authorizations(
 receipt_id,schema_version,context,owner_decision_reference,issuer_role,executor_task_id,teardown_owner,
 backend_project_ref,source_sha,artifact_digest,configuration_digest,deployment_id,exact_origin,runtime_version,
 fixture_manifest_digest,identity_allowlist,allowed_capabilities,excluded_provider_actions,issued_at,expires_at)
values ('99000000-0000-4000-8000-000000000021',1,'internal_synthetic_assessment','ADR0008 owner approval','product_owner',
 '01a07739-9f14-73c0-8253-2da0e5576afe','product-reset-task','ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app',1,repeat('d',64),array['99000000-0000-4000-8000-000000000001']::uuid[],
 array['catalog','session'],array['email','external_participants','media','routing','payments','public_activation'],statement_timestamp(),statement_timestamp()+interval '20 minutes');
select ok(internal_review_private.is_internal('99000000-0000-4000-8000-000000000002')
 and internal_review_private.valid_until('99000000-0000-4000-8000-000000000002') is null
 and not internal_review_private.session_allowed('99000000-0000-4000-8000-000000000002'),
 'B stays outside identities and is denied in the bound internal context');
select set_config('request.path','rpc/synthetic_catalog_gateway_request',true);
select set_config('request.method','POST',true);
select set_config('request.jwt.claims','{"role":"public_catalog_gateway"}',true);
select set_config('request.headers','{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
set local role public_catalog_gateway;
select lives_ok($$select app_public.internal_review_pre_request()$$,'internal gateway request context passes installed guard');
select is((select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(app_public.synthetic_catalog_gateway_request(
 repeat('f',64),'99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":"Nearby Boundary","p_category":"issue-644-synth","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}'::jsonb)) x),
 array['99000000-0000-4000-8000-000000007101'::uuid],'internal Nearby admits only frozen 7101 subset');
reset role;
update internal_review_private.runtime_binding set configuration_digest=repeat('e',64) where id=1;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('e',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":"Nearby Boundary","p_category":"issue-644-synth","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','mismatched runtime binding denies A receipt');
reset role;
update internal_review_private.runtime_binding set configuration_digest=repeat('c',64) where id=1;
set local role public_catalog_gateway;
select is((select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(app_public.synthetic_catalog_gateway_request(
 repeat('f',64),'99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":"Nearby Boundary","p_category":"issue-644-synth","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}'::jsonb)) x),
 array['99000000-0000-4000-8000-000000007101'::uuid],'restored runtime binding preserves A positive');
select set_config('request.headers','{"origin":"https://foreign.invalid"}',true);
select throws_ok($$select app_public.internal_review_pre_request()$$,
 '42501','internal_request_denied','foreign origin is denied by pre-request guard');
select set_config('request.headers','{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
select set_config('request.method','GET',true);
select throws_ok($$select app_public.internal_review_pre_request()$$,
 '42501','internal_request_denied','GET is denied by pre-request guard');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('f',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','GET context is denied by wrapper session check');
select set_config('request.method','POST',true);
select set_config('request.path','rpc/unsupported',true);
select throws_ok($$select app_public.internal_review_pre_request()$$,
 '42501','internal_request_denied','unsupported RPC is denied by pre-request guard');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('f',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','unsupported path is denied by wrapper session check');
select set_config('request.path','rpc/synthetic_catalog_gateway_request',true);
select lives_ok($$select app_public.internal_review_pre_request()$$,'restored gateway request context passes pre-request guard');
select is((select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(app_public.synthetic_catalog_gateway_request(
 repeat('f',64),'99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":"Nearby Boundary","p_category":"issue-644-synth","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}'::jsonb)) x),
 array['99000000-0000-4000-8000-000000007101'::uuid],'restored request context preserves A positive');
select ok(exists(select 1 from jsonb_array_elements(app_public.synthetic_catalog_gateway_request(
 repeat('7',64),'99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":"Nearby Boundary","p_category":"issue-644-synth","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}'::jsonb)) x
 where x->>'id'='99000000-0000-4000-8000-000000007101' and x ? 'device_distance_miles'
 and not (x ? 'device_latitude') and not (x ? 'device_longitude')),
 'internal response includes distance without returning request center');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('6',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":"Nearby Boundary","p_category":"issue-644-synth","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','unlisted B cannot use A internal authorization');
select is(jsonb_array_length(app_public.synthetic_catalog_gateway_request(repeat('8',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','list','{}')),12,
 'legacy internal list retains twelve seeded stores');
select is(jsonb_array_length(app_public.synthetic_catalog_gateway_request(repeat('9',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','details',
 '{"p_slug":"nearby-644-7101"}')),0,'legacy internal details still excludes Nearby fixture IDs');
reset role;
update internal_review_private.authorizations
set revoked_at=statement_timestamp(),revocation_reason='issue-644 fixture'
where receipt_id='99000000-0000-4000-8000-000000000021';
select ok(exists(select 1 from app_private.active_sessions where user_id='99000000-0000-4000-8000-000000000001'
 and session_id='99000000-0000-4000-8000-000000000011' and state='active'
 and revoked_at is null and access_token_expires_at>statement_timestamp()),
 'revoked receipt fixture leaves A provider session active');
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('f',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','revoked internal receipt denies A with active session');
reset role;
insert into internal_review_private.authorizations
select (jsonb_populate_record(null::internal_review_private.authorizations,
 to_jsonb(a)||jsonb_build_object('receipt_id','99000000-0000-4000-8000-000000000022',
 'issued_at',statement_timestamp()-interval '2 hours','expires_at',statement_timestamp()-interval '1 hour',
 'revoked_at',null,'revocation_reason',null))).* from internal_review_private.authorizations a
where receipt_id='99000000-0000-4000-8000-000000000021';
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000001') is null
 and exists(select 1 from app_private.active_sessions where user_id='99000000-0000-4000-8000-000000000001'
 and session_id='99000000-0000-4000-8000-000000000011' and state='active'
 and revoked_at is null and access_token_expires_at>statement_timestamp()),
 'expired receipt is invalid while A provider session stays active');
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('f',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 '42501','synthetic_catalog_forbidden','expired internal receipt denies A with active session');
reset role;
set local role identity_service;
update app_private.environment_stage set stage='private_beta' where id=1;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('4',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000012','nearby-list',
 '{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,
 'P0001','synthetic_catalog_outside_stage','outside-alpha signal remains available for Edge routing');
reset role;
select ok(not exists(select 1 from pg_attribute where attrelid='release_private.public_catalog_rate_windows'::regclass
 and not attisdropped and attname in ('device_latitude','device_longitude','p_device_latitude','p_device_longitude'))
 and exists(select 1 from release_private.public_catalog_rate_windows
 where key_hash=decode(repeat('f',64),'hex') and operation='nearby-list'),
 'nearby rate evidence contains only existing center-free fields');
select * from finish();
rollback;
