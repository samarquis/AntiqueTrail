select set_config('test.issue_568_private_stop_capability',
  (select enabled::text from trip_private.private_stop_capability where singleton),false);
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

-- Remove only this test's committed fixtures so interrupted prior runs are repeatable.
begin;
update trip_private.private_stop_capability
   set enabled=current_setting('test.issue_568_private_stop_capability')::boolean where singleton;
delete from trip_private.trip_invitations where invitation_id='56800000-0000-4000-8000-000000000331';
delete from trip_private.trips where trip_id='56800000-0000-4000-8000-000000000321';
delete from app_private.role_grants where subject_user_id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from app_private.profiles where user_id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from auth.sessions where id in
  ('56800000-0000-4000-8000-000000000311','56800000-0000-4000-8000-000000000312');
delete from auth.users where id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from trip_private.email_hmac_keys
 where environment='shared_alpha' and purpose='trip_invitation' and key_version=569;
commit;

begin;
insert into auth.users(id,email,email_confirmed_at) values
  ('56800000-0000-4000-8000-000000000301','race-owner-568@example.invalid',statement_timestamp()),
  ('56800000-0000-4000-8000-000000000302','race-partner-568@example.invalid',statement_timestamp());
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('56800000-0000-4000-8000-000000000311','56800000-0000-4000-8000-000000000301',statement_timestamp(),statement_timestamp()),
  ('56800000-0000-4000-8000-000000000312','56800000-0000-4000-8000-000000000302',statement_timestamp(),statement_timestamp());
set local role identity_service;
update app_private.profiles set verified_email_snapshot=case user_id
  when '56800000-0000-4000-8000-000000000301' then 'race-owner-568@example.invalid'
  when '56800000-0000-4000-8000-000000000302' then 'race-partner-568@example.invalid' end,
  age_18_attested_at=statement_timestamp()
where user_id in ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
insert into app_private.role_grants(subject_user_id,role,state) values
  ('56800000-0000-4000-8000-000000000301','shopper','active'),
  ('56800000-0000-4000-8000-000000000302','shopper','active');
reset role;
set local role trip_email_key_manager;
insert into trip_private.email_hmac_keys(environment,purpose,key_version,key_material,state)
values ('shared_alpha','trip_invitation',569,extensions.digest(convert_to('issue-568-race-key','utf8'),'sha256'),'active');
reset role;
set local role identity_service;
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,version)
select '56800000-0000-4000-8000-000000000321','56800000-0000-4000-8000-000000000301',a.id,
  'Private-stop race',date '2026-10-07',10
from (select id from app_public.catalog_areas order by sort_order,slug limit 1) as a;
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
values ('56800000-0000-4000-8000-000000000321','56800000-0000-4000-8000-000000000301','creator');
insert into trip_private.trip_invitations(
  invitation_id,trip_id,token_hash,recipient_email_hmac,expires_at,state,idempotency_key,
  environment,purpose,email_hmac_key_version
)
select '56800000-0000-4000-8000-000000000331',
  '56800000-0000-4000-8000-000000000321',
  extensions.digest(convert_to(repeat('r',32),'utf8'),'sha256'),h.value,
  statement_timestamp()+interval '1 day','pending','issue568-race-private-boundary',
  'shared_alpha','trip_invitation',h.key_version
from trip_private.email_hmac('race-partner-568@example.invalid','trip_invitation','shared_alpha',569) as h;
commit;

begin;
select no_plan();

select extensions.dblink_connect('issue568_owner','dbname=postgres application_name=issue568_owner_568');
select extensions.dblink_connect('issue568_invitee','dbname=postgres application_name=issue568_invitee_568');
select extensions.dblink_exec('issue568_owner',$remote$
  begin;
  set local role identity_service;
  update trip_private.private_stop_capability set enabled=true where singleton;
  reset role;
  do $$begin perform 1 from trip_private.trips
    where trip_id='56800000-0000-4000-8000-000000000321' for update; end$$;
  set local role authenticated;
  set local request.jwt.claims='{"sub":"56800000-0000-4000-8000-000000000301","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000311"}';
  do $$begin perform app_public.register_current_session(
    (extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint); end$$;
$remote$);
select extensions.dblink_exec('issue568_invitee',$remote$
  begin;
  create function pg_temp.try_accept_private_stop_race() returns text language plpgsql as $$
  begin
    perform app_public.accept_trip_invitation(repeat('r',32));
    return 'accepted';
  exception when others then return sqlerrm;
  end $$;
  grant execute on function pg_temp.try_accept_private_stop_race() to authenticated;
  set local role authenticated;
  set local request.jwt.claims='{"sub":"56800000-0000-4000-8000-000000000302","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000312"}';
  do $$begin perform app_public.register_current_session(
    (extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint); end$$;
$remote$);
select extensions.dblink_send_query('issue568_invitee','select pg_temp.try_accept_private_stop_race()');
do $$
declare v_deadline timestamptz:=clock_timestamp()+interval '5 seconds';
begin
  perform set_config('test.race_lock_observed','false',false);
  while clock_timestamp()<v_deadline loop
    if exists(
      select 1 from pg_catalog.pg_stat_activity as invitee
      where invitee.application_name='issue568_invitee_568'
        and invitee.wait_event_type='Lock'
        and exists(
          select 1 from pg_catalog.pg_stat_activity as owner
          where owner.application_name='issue568_owner_568'
            and owner.pid=any(pg_catalog.pg_blocking_pids(invitee.pid))
        )
    ) then
      perform set_config('test.race_lock_observed','true',false);
      exit;
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end
$$;
select ok(current_setting('test.race_lock_observed')='true',
  'invitation acceptance blocks on the owner-held trip lock before private-stop creation');
select extensions.dblink_send_query('issue568_owner',$query$
  select app_public.add_private_trip_stop(
    '56800000-0000-4000-8000-000000000321','Race Private Shop','123 Race St',null,null,
    'must',60,10,'add_private_trip_stop:race')
$query$);
select set_config('test.race_create',(
  select result.value::text from extensions.dblink_get_result('issue568_owner') as result(value jsonb)),false);
select extensions.dblink_exec('issue568_owner',format(
  'reset role; set local role identity_service; update trip_private.private_stop_capability set enabled=%L::boolean where singleton',
  current_setting('test.issue_568_private_stop_capability')));
select extensions.dblink_exec('issue568_owner','commit');
select set_config('test.race_accept',(
  select result.value from extensions.dblink_get_result('issue568_invitee') as result(value text)),false);
select extensions.dblink_exec('issue568_invitee','commit');
select extensions.dblink_disconnect('issue568_owner');
select extensions.dblink_disconnect('issue568_invitee');

select is(current_setting('test.race_accept'),'trip_partner_join_private_stop',
  'concurrent invitation acceptance waits and is denied after private-stop creation');
select is((select count(*) from trip_private.trip_stops as s
  where s.trip_id='56800000-0000-4000-8000-000000000321' and s.kind='private'),1::bigint,
  'the racing owner creates exactly one private stop');
select is((select count(*) from trip_private.trip_participants as p
  where p.trip_id='56800000-0000-4000-8000-000000000321'
    and p.participant_role='partner' and p.state='active'),0::bigint,
  'racing invitee never becomes an active partner who can read the private stop');
delete from trip_private.trip_invitations where invitation_id='56800000-0000-4000-8000-000000000331';
delete from trip_private.trips where trip_id='56800000-0000-4000-8000-000000000321';
delete from app_private.role_grants where subject_user_id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from app_private.profiles where user_id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from auth.sessions where id in
  ('56800000-0000-4000-8000-000000000311','56800000-0000-4000-8000-000000000312');
delete from auth.users where id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from trip_private.email_hmac_keys
 where environment='shared_alpha' and purpose='trip_invitation' and key_version=569;
update trip_private.private_stop_capability
   set enabled=current_setting('test.issue_568_private_stop_capability')::boolean where singleton;
select is((select enabled from trip_private.private_stop_capability where singleton),
  current_setting('test.issue_568_private_stop_capability')::boolean,
  'race restores the private-stop capability to its captured value');
select * from finish();
commit;
