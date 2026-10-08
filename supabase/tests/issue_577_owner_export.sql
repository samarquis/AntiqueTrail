begin;
select plan(21);

insert into auth.users(id) values
  ('57700000-0000-4000-8000-000000000001'),
  ('57700000-0000-4000-8000-000000000002');
insert into app_private.profiles(user_id,verified_email_snapshot,public_display_name,age_18_attested_at,last_authenticated_at)
values
  ('57700000-0000-4000-8000-000000000001','owner-a@example.test','Owner A',statement_timestamp(),statement_timestamp()),
  ('57700000-0000-4000-8000-000000000002','owner-b@example.test','Owner B',statement_timestamp(),statement_timestamp());
insert into shopper_private.private_store_memories(user_id,store_id,rating,note,last_visit_month)
values ('57700000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001001',4,'OWNER-A-STORE-SUMMARY-NOTE','2026-09-01');

insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,state) values
  ('57700000-0000-4000-8000-000000000010','57700000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','OWNER-A-TRIP','2026-10-07','completed'),
  ('57700000-0000-4000-8000-000000000011','57700000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','OWNER-B-TRIP','2026-10-07','draft');
insert into trip_private.trip_participants(trip_id,user_id,participant_role,state) values
  ('57700000-0000-4000-8000-000000000010','57700000-0000-4000-8000-000000000001','creator','active'),
  ('57700000-0000-4000-8000-000000000010','57700000-0000-4000-8000-000000000002','partner','active'),
  ('57700000-0000-4000-8000-000000000011','57700000-0000-4000-8000-000000000002','creator','active'),
  ('57700000-0000-4000-8000-000000000011','57700000-0000-4000-8000-000000000001','partner','active');

insert into trip_private.trip_stops(
  stop_id,trip_id,kind,store_id,rest_label,rest_address,private_name,private_address,
  private_source_url,private_hours,destination_status,position,priority,
  planned_dwell_minutes,state,completed_at,version
) values
  ('57700000-0000-4000-8000-000000000020','57700000-0000-4000-8000-000000000010','private',null,null,null,'OWNER-A-PRIVATE-STOP',null,'https://example.test/a',
    jsonb_build_object('timeZone','America/Chicago','weekly',jsonb_build_array(
      jsonb_build_object('weekday',0,'label','Sunday','isClosed',true,'intervals','[]'::jsonb),
      jsonb_build_object('weekday',1,'label','Monday','isClosed',false,'intervals',jsonb_build_array(jsonb_build_object('opensAt','09:00','closesAt','17:00'))),
      jsonb_build_object('weekday',2,'label','Tuesday','isClosed',false,'intervals','[]'::jsonb),
      jsonb_build_object('weekday',3,'label','Wednesday','isClosed',false,'intervals','[]'::jsonb),
      jsonb_build_object('weekday',4,'label','Thursday','isClosed',false,'intervals','[]'::jsonb),
      jsonb_build_object('weekday',5,'label','Friday','isClosed',false,'intervals','[]'::jsonb),
      jsonb_build_object('weekday',6,'label','Saturday','isClosed',false,'intervals','[]'::jsonb)),
      'holidays','[]'::jsonb,'version',1),'draft',0,'must',60,'completed',statement_timestamp(),1),
  ('57700000-0000-4000-8000-000000000021','57700000-0000-4000-8000-000000000010','private',null,null,null,'DETACHED-PRIVATE-STOP',null,'https://example.test/detached',null,'draft',1,'flexible',60,'completed',statement_timestamp(),1),
  ('57700000-0000-4000-8000-000000000022','57700000-0000-4000-8000-000000000011','private',null,null,null,'OWNER-B-PRIVATE-STOP','OWNER-B-ADDRESS','https://example.test/b',null,'draft',0,'prefer',60,'planned',null,1),
  ('57700000-0000-4000-8000-000000000025','57700000-0000-4000-8000-000000000010','store','00000000-0000-4000-8000-000000001001',null,null,null,null,null,null,null,2,'flexible',60,'completed',statement_timestamp(),1),
  ('57700000-0000-4000-8000-000000000026','57700000-0000-4000-8000-000000000010','rest',null,'OWNER-A-REST','OWNER-A-REST-ADDRESS',null,null,null,null,null,3,'flexible',60,'completed',statement_timestamp(),1),
  ('57700000-0000-4000-8000-000000000027','57700000-0000-4000-8000-000000000011','store','00000000-0000-4000-8000-000000001001',null,null,null,null,null,null,null,1,'flexible',60,'planned',null,1);

insert into trip_private.trip_visit_memories(
  memory_id,author_user_id,trip_id,stop_id,store_id,private_stop_id,
  private_stop_name,private_stop_address,rating,return_choice,note,version
) values
  ('57700000-0000-4000-8000-000000000030','57700000-0000-4000-8000-000000000001','57700000-0000-4000-8000-000000000010','57700000-0000-4000-8000-000000000020',null,'57700000-0000-4000-8000-000000000020','OWNER-A-PRIVATE-STOP','OWNER-A-MEMORY-ADDRESS-SNAPSHOT',5,'yes','OWNER-A-AUTHORED-NOTE',1),
  ('57700000-0000-4000-8000-000000000031','57700000-0000-4000-8000-000000000002','57700000-0000-4000-8000-000000000010','57700000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000001001',null,null,null,1,'no','OWNER-B-AUTHORED-ON-A-TRIP',1),
  ('57700000-0000-4000-8000-000000000033','57700000-0000-4000-8000-000000000002','57700000-0000-4000-8000-000000000011','57700000-0000-4000-8000-000000000022',null,'57700000-0000-4000-8000-000000000022','OWNER-B-PRIVATE-STOP','OWNER-B-ADDRESS',2,'no','OWNER-B-AUTHORED-NOTE',1),
  ('57700000-0000-4000-8000-000000000034','57700000-0000-4000-8000-000000000001','57700000-0000-4000-8000-000000000010','57700000-0000-4000-8000-000000000021',null,'57700000-0000-4000-8000-000000000021','DETACHED-PRIVATE-STOP','DETACHED-ADDRESS-SNAPSHOT',3,'maybe','DETACHED-MEMORY-NOTE',1),
  ('57700000-0000-4000-8000-000000000035','57700000-0000-4000-8000-000000000001','57700000-0000-4000-8000-000000000010','57700000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000001001',null,null,null,4,'yes','OWNER-A-CATALOG-VISIT-NOTE',1),
  ('57700000-0000-4000-8000-000000000036','57700000-0000-4000-8000-000000000001','57700000-0000-4000-8000-000000000011','57700000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000001001',null,null,null,5,'yes','OWNER-A-REPEAT-CATALOG-VISIT-NOTE',1);

delete from trip_private.trip_stops where stop_id='57700000-0000-4000-8000-000000000021';

insert into app_private.account_export_jobs(export_job_id,user_id,state,claim_token,claimed_at,lease_expires_at,attempt_count)
values
  ('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000001','building','57700000-0000-4000-8000-000000000041',statement_timestamp(),statement_timestamp()+interval '5 minutes',1),
  ('57700000-0000-4000-8000-000000000042','57700000-0000-4000-8000-000000000002','building','57700000-0000-4000-8000-000000000043',statement_timestamp(),statement_timestamp()+interval '5 minutes',1);

set local role account_lifecycle_service;

select is(jsonb_array_length(app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,privateStops}'),1,'owner A gets only extant private stops from trips they own');
select ok(app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,privateStops}' @> '[{"stopId":"57700000-0000-4000-8000-000000000020","label":"OWNER-A-PRIVATE-STOP"}]'::jsonb,'owner A export includes their private stop');
select ok(
  app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,privateStops}' @> '[{"stopId":"57700000-0000-4000-8000-000000000020","state":"completed","address":null,"shopperHours":{"timeZone":"America/Chicago","version":1,"weekly":[{"weekday":1,"label":"Monday","intervals":[{"opensAt":"09:00","closesAt":"17:00"}]}]}}]'::jsonb
  and app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,visitMemories}' @> '[{"memoryId":"57700000-0000-4000-8000-000000000030","privateStopAddress":"OWNER-A-MEMORY-ADDRESS-SNAPSHOT"}]'::jsonb,
  'completed trip exports the extant private stop with JSON hours, without its cleared address, and retains the visit snapshot');
select ok(app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,memories}' @> '[{"storeId":"00000000-0000-4000-8000-000000001001","note":"OWNER-A-STORE-SUMMARY-NOTE"}]'::jsonb,'existing store summary stays in shopper.memories');
select ok(not (app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,privateStops}') @> '[{"stopId":"57700000-0000-4000-8000-000000000022"}]'::jsonb,'partner access does not export owner B private stops');
select ok(not (app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,privateStops}') @> '[{"stopId":"57700000-0000-4000-8000-000000000021"}]'::jsonb,'detached stop is not resurrected by its memory snapshot');
select ok(
  not (app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,privateStops}') @> '[{"stopId":"57700000-0000-4000-8000-000000000025"}]'::jsonb
  and not (app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,privateStops}') @> '[{"stopId":"57700000-0000-4000-8000-000000000026"}]'::jsonb,
  'catalog and rest stops are excluded from private-stop export');
select is(jsonb_array_length(app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,visitMemories}'),4,'owner A gets all and only their authored visit memories');
select ok(app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,visitMemories}' @> '[{"memoryId":"57700000-0000-4000-8000-000000000030","stopId":"57700000-0000-4000-8000-000000000020","privateStopId":"57700000-0000-4000-8000-000000000020","note":"OWNER-A-AUTHORED-NOTE"}]'::jsonb,'owner A export includes an authored memory with its stable and live stop identities');
select ok(app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,visitMemories}' @> '[{"memoryId":"57700000-0000-4000-8000-000000000036","note":"OWNER-A-REPEAT-CATALOG-VISIT-NOTE"}]'::jsonb,'author scope includes owner A memory on partner trip');
select ok(app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,visitMemories}' @> '[{"memoryId":"57700000-0000-4000-8000-000000000034","stopId":"57700000-0000-4000-8000-000000000021","privateStopId":null,"privateStopName":"DETACHED-PRIVATE-STOP","privateStopAddress":"DETACHED-ADDRESS-SNAPSHOT"}]'::jsonb,'detached visit memory retains stable stop identity and snapshot after its link clears');
select ok(
  app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,visitMemories}' @> '[{"memoryId":"57700000-0000-4000-8000-000000000035","stopId":"57700000-0000-4000-8000-000000000025","storeId":"00000000-0000-4000-8000-000000001001","privateStopId":null,"privateStopName":null,"privateStopAddress":null},{"memoryId":"57700000-0000-4000-8000-000000000036","stopId":"57700000-0000-4000-8000-000000000027","storeId":"00000000-0000-4000-8000-000000001001","privateStopId":null,"privateStopName":null,"privateStopAddress":null}]'::jsonb,
  'catalog visits retain null private snapshots and distinct stop/memory IDs for the same store across trips');
select ok(not (app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,visitMemories}') @> '[{"memoryId":"57700000-0000-4000-8000-000000000031"}]'::jsonb,'owner A export excludes partner-authored memory on same trip');
select ok(not (app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,visitMemories}') @> '[{"memoryId":"57700000-0000-4000-8000-000000000033"}]'::jsonb,'owner A export excludes owner B visit content');
select ok(not (app_public.build_account_export('57700000-0000-4000-8000-000000000040','57700000-0000-4000-8000-000000000041')::jsonb #> '{canonical,shopper,visitMemories}') @> '[{"note":"OWNER-B-AUTHORED-NOTE"}]'::jsonb,'owner A export contains no owner B private note');

select is(jsonb_array_length(app_public.build_account_export('57700000-0000-4000-8000-000000000042','57700000-0000-4000-8000-000000000043')::jsonb #> '{canonical,shopper,privateStops}'),1,'owner B gets only extant private stops from trips they own');
select ok(app_public.build_account_export('57700000-0000-4000-8000-000000000042','57700000-0000-4000-8000-000000000043')::jsonb #> '{canonical,shopper,privateStops}' @> '[{"stopId":"57700000-0000-4000-8000-000000000022","label":"OWNER-B-PRIVATE-STOP"}]'::jsonb,'owner B export includes their private stop');
select ok(not (app_public.build_account_export('57700000-0000-4000-8000-000000000042','57700000-0000-4000-8000-000000000043')::jsonb #> '{canonical,shopper,privateStops}') @> '[{"stopId":"57700000-0000-4000-8000-000000000020"}]'::jsonb,'partner access does not export owner A private stops');
select is(jsonb_array_length(app_public.build_account_export('57700000-0000-4000-8000-000000000042','57700000-0000-4000-8000-000000000043')::jsonb #> '{canonical,shopper,visitMemories}'),2,'owner B gets all and only their authored visit memories');
select ok(
  app_public.build_account_export('57700000-0000-4000-8000-000000000042','57700000-0000-4000-8000-000000000043')::jsonb #> '{canonical,shopper,visitMemories}' @> '[{"memoryId":"57700000-0000-4000-8000-000000000031","note":"OWNER-B-AUTHORED-ON-A-TRIP"}]'::jsonb
  and app_public.build_account_export('57700000-0000-4000-8000-000000000042','57700000-0000-4000-8000-000000000043')::jsonb #> '{canonical,shopper,visitMemories}' @> '[{"memoryId":"57700000-0000-4000-8000-000000000033","privateStopId":"57700000-0000-4000-8000-000000000022","privateStopName":"OWNER-B-PRIVATE-STOP","note":"OWNER-B-AUTHORED-NOTE"}]'::jsonb
  and not (app_public.build_account_export('57700000-0000-4000-8000-000000000042','57700000-0000-4000-8000-000000000043')::jsonb #> '{canonical,shopper,visitMemories}') @> '[{"memoryId":"57700000-0000-4000-8000-000000000030"}]'::jsonb,
  'owner B export includes their private and partner-trip memories, excluding owner A content');
select ok(not (app_public.build_account_export('57700000-0000-4000-8000-000000000042','57700000-0000-4000-8000-000000000043')::jsonb #> '{canonical,shopper,visitMemories}') @> '[{"memoryId":"57700000-0000-4000-8000-000000000036"}]'::jsonb,'owner B export excludes partner-authored memory on same trip');

reset role;
select * from finish();
rollback;
