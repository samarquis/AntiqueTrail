begin;
select plan(49);

select has_table('app_private','audit_anchor_capability','server-owned anchor capability exists');
select has_table('app_private','audit_anchor_outbox','content-free anchor outbox exists');
select is((select state from app_private.audit_anchor_capability where id=1),'disabled','external anchor provider is disabled by default');
select is((select deployment_environment from app_private.audit_anchor_capability where id=1),'local','deployment defaults to local only');
select is((select watchdog_state from app_private.audit_anchor_capability where id=1),'disabled','watchdog defaults fail closed for remote use');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='audit_anchor_capability'),'anchor capability FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='audit_anchor_outbox'),'anchor outbox FORCE RLS enabled');
select ok(not exists(
  select 1 from information_schema.columns where table_schema='app_private' and table_name='audit_anchor_outbox'
    and column_name ~ '(actor|target|payload|challenge|secret)'
),'anchor outbox has no actor, target, private payload, challenge, or secret columns');
select has_function('app_private','privileged_anchor_is_current',array[]::text[],'single privileged anchor gate exists');
select has_function('app_public','prepare_audit_anchor',array[]::text[],'deterministic root preparation exists');
select has_function('app_public','audit_anchor_watchdog',array['timestamp with time zone'],'24-hour watchdog exists');
select has_function('app_public','claim_audit_anchor',array['uuid','timestamp with time zone'],'lease claim exists');
select has_function('app_public','acknowledge_audit_anchor',array['text','uuid','timestamp with time zone'],'publish acknowledgement exists');
select has_function('app_public','fail_audit_anchor',array['text','uuid','timestamp with time zone','text'],'publish failure/replay exists');
select ok(has_function_privilege('service_role','app_public.claim_audit_anchor(uuid,timestamp with time zone)','EXECUTE'),'only worker service role may claim');
select ok(not has_function_privilege('anon','app_public.claim_audit_anchor(uuid,timestamp with time zone)','EXECUTE'),'anonymous caller cannot claim anchors');
select ok(not has_function_privilege('authenticated','app_public.claim_audit_anchor(uuid,timestamp with time zone)','EXECUTE'),'authenticated caller cannot claim anchors');
select ok(not has_table_privilege('service_role','app_private.audit_anchor_outbox','SELECT'),'worker cannot bypass bounded RPCs to read outbox');

set local role authenticated;
select throws_ok(
  $$select app_private.privileged_anchor_is_current()$$,
  '42501','permission denied for function privileged_anchor_is_current',
  'authenticated callers cannot directly bypass the server-owned anchor gate'
);
reset role;

select ok(position('privileged_anchor_is_current' in pg_get_functiondef('app_private.current_user_has_role(app_private.app_role,uuid)'::regprocedure))>0,
  'all representative and administrator role checks pass through the single anchor gate');
select has_trigger('app_private','role_grants','role_grant_anchor_guard','direct privileged role activation is guarded');
select has_trigger('partner_private','store_partner_grants','partner_grant_anchor_guard','partner scope activation cannot bypass anchoring');
select ok(position('privileged_anchor_is_current' in pg_get_functiondef('app_private.guard_privileged_role_activation()'::regprocedure))>0,
  'direct activation guards use the same single server-owned anchor gate');
select ok(app_private.privileged_anchor_is_current(),'local Synthetic-only privileged work remains permitted');

update app_private.audit_anchor_capability set deployment_environment='shared_alpha',state='disabled',
  watchdog_state='disabled',changed_at=statement_timestamp(),version=version+1 where id=1;
select ok(not app_private.privileged_anchor_is_current(),'shared privileged work is denied while provider capability is disabled');
insert into auth.users(id) values('55000000-0000-4000-8000-000000000001');
select throws_ok(
  $$insert into app_private.role_grants(subject_user_id,role,state)
    values('55000000-0000-4000-8000-000000000001','administrator','active')$$,
  '42501','privileged_anchor_stale','direct privileged grant activation is denied while the anchor is unavailable'
);

insert into app_private.privileged_audit_events(
  actor_role,action,outcome,resource_kind,reason_code,event_hash
) values('administrator','audit_anchor_fixture','completed','system','fixture',decode(repeat('00',32),'hex'));
update app_private.audit_anchor_capability set state='open',provider_key='test_sink',provider_version='contract-v1',
  contract_receipt_id='receipt:l01:test',changed_at=statement_timestamp(),version=version+1 where id=1;

set local role service_role;
select is(app_public.prepare_audit_anchor()->>'state','pending','latest audit high-water prepares one pending root');
reset role;
select is((select count(*) from app_private.audit_anchor_outbox),1::bigint,'one deterministic outbox row is created');
select is((select octet_length(root_hash) from app_private.audit_anchor_outbox),32,'derived root is exactly 32 bytes');
select is((select idempotency_key from app_private.audit_anchor_outbox),
  (select environment||':'||schema_version||':'||through_sequence_no||':'||encode(root_hash,'hex') from app_private.audit_anchor_outbox),
  'idempotency key is derived only from the content-free envelope');
set local role service_role;
select lives_ok($$select app_public.prepare_audit_anchor()$$,'preparing the same high-water is idempotent');
reset role;
select is((select count(*) from app_private.audit_anchor_outbox),1::bigint,'preparation replay creates no duplicate root');

set local role service_role;
select set_config('test.anchor_claim',app_public.claim_audit_anchor(
  '00000000-0000-4000-8000-000000000051',statement_timestamp()
)::text,true);
reset role;
select ok(current_setting('test.anchor_claim')::jsonb is not null,'open provider capability permits one lease claim');
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('test.anchor_claim')::jsonb->'payload') k),
  array['environment','idempotencyKey','root','schema','sequence'],
  'outbound payload structurally contains exactly five content-free fields');
select ok(not (current_setting('test.anchor_claim')::jsonb->'payload' ?| array['actor','target','payload','token','challenge','secret']),
  'outbound payload exposes no prohibited private field');
select is((select state from app_private.audit_anchor_outbox),'leased','claim records a bounded lease');
select is((select attempt_count from app_private.audit_anchor_outbox),1,'first claim records one publish attempt');

set local role service_role;
select ok(app_public.acknowledge_audit_anchor(
  current_setting('test.anchor_claim')::jsonb->'payload'->>'idempotencyKey',
  (current_setting('test.anchor_claim')::jsonb->>'leaseToken')::uuid,statement_timestamp()
),'matching lease acknowledges publication');
reset role;
select is((select state from app_private.audit_anchor_outbox),'acknowledged','acknowledged root becomes terminal');
select ok(app_private.privileged_anchor_is_current(),'fresh acknowledgement at the audit high-water opens shared privilege');

insert into app_private.privileged_audit_events(
  actor_role,action,outcome,resource_kind,reason_code,event_hash
) values('administrator','audit_anchor_fixture_two','completed','system','fixture',decode(repeat('00',32),'hex'));
select ok(not app_private.privileged_anchor_is_current(),'a new unanchored privileged event immediately closes shared privilege');

set local role service_role;
select app_public.prepare_audit_anchor();
select set_config('test.anchor_retry_claim',app_public.claim_audit_anchor(
  '00000000-0000-4000-8000-000000000052',statement_timestamp()
)::text,true);
select ok(app_public.fail_audit_anchor(
  current_setting('test.anchor_retry_claim')::jsonb->'payload'->>'idempotencyKey',
  (current_setting('test.anchor_retry_claim')::jsonb->>'leaseToken')::uuid,
  statement_timestamp(),'anchor_publish_unknown'
),'unknown publish outcome is recorded for replay, never guessed successful');
reset role;
select is((select state from app_private.audit_anchor_outbox order by through_sequence_no desc limit 1),'retry_wait','failed publish waits for bounded replay');
set local role service_role;
select is(app_public.claim_audit_anchor('00000000-0000-4000-8000-000000000052',statement_timestamp()),null,'retry cannot bypass its backoff');
select set_config('test.anchor_replay_claim',app_public.claim_audit_anchor(
  '00000000-0000-4000-8000-000000000052',statement_timestamp()+interval '2 minutes'
)::text,true);
reset role;
select is(current_setting('test.anchor_replay_claim')::jsonb->'payload'->>'idempotencyKey',
  current_setting('test.anchor_retry_claim')::jsonb->'payload'->>'idempotencyKey',
  'replay preserves the exact provider idempotency key');

update app_private.audit_anchor_capability set last_ack_at=statement_timestamp()-interval '25 hours',
  watchdog_state='current',version=version+1 where id=1;
set local role service_role;
select is(app_public.audit_anchor_watchdog(statement_timestamp()),'stale','watchdog detects an anchor older than 24 hours');
reset role;
select ok(not app_private.privileged_anchor_is_current(),'stale watchdog state keeps shared privilege closed');
select ok(exists(
  select 1 from app_private.audit_chain_roots r join app_private.audit_anchor_outbox o
    on o.through_sequence_no=r.through_sequence_no and o.root_hash=r.root_hash
),'prepared outbox root is bound to the local append-only audit root table');
select is((select max(through_sequence_no) from app_private.audit_anchor_outbox),
  (select max(sequence_no) from app_private.privileged_audit_events),
  'latest prepared root covers the exact audit high-water sequence');

select * from finish();
rollback;
