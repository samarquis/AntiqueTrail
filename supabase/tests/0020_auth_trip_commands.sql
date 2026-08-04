begin;
select plan(19);

select has_function('app_public','register_current_session',array['bigint'],'server session registration RPC exists');
select has_function('app_public','current_session_is_active',array[]::text[],'server session check RPC exists');
select has_function('app_public','revoke_current_session',array['text'],'server session revocation RPC exists');
select has_function('app_public','list_trips',array[]::text[],'trip list RPC exists');
select has_function('app_public','get_trip',array['text'],'trip read RPC exists');
select has_function('app_public','create_trip',array['text','text'],'trip creation RPC exists');
select has_function('app_public','add_trip_stop',array['text','text','text','text','integer'],'bounded add-stop RPC exists');
select has_function('app_public','reorder_trip_stop',array['text','text','integer'],'bounded reorder RPC exists');
select has_function('app_public','review_trip_hours',array['text'],'hours review command exists');
select has_function('app_public','start_trip',array['text'],'trip start command exists');
select has_function('app_public','mark_arrived',array['text','text'],'arrived command exists');
select has_function('app_public','complete_trip_stop',array['text','text'],'complete command exists');
select has_function('app_public','skip_trip_stop',array['text','text'],'skip command exists');
select has_function('app_public','replay_trip_mutation',array['text','jsonb'],'offline replay envelope RPC exists');
select has_function('app_public','save_check_my_day_choice',array['text','text','text[]'],'Check My Day authoritative choice RPC exists');
select has_table('trip_private','check_my_day_command_evidence','Check My Day evidence is durable');
select ok(not has_schema_privilege('identity_service','trip_private','CREATE'),
  'identity service cannot create private trip objects after ownership transfer');

set local role anon;
select throws_ok($$select app_public.register_current_session(9999999999999)$$,'42501','anonymous cannot register a session');
select throws_ok($$select app_public.list_trips()$$,'42501','anonymous cannot read private trips');

reset role;
select * from finish();
rollback;
