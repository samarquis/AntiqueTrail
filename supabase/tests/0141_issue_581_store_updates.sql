-- #581: update edit, replay/version errors, exact Owner scope, and sale expiry.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/issue_581_owner_updates.inc

select is((select count(*) from app_private.role_grants
  where subject_user_id='58100000-0000-4000-8000-000000000001' and store_id='58100000-0000-4000-8000-000000000011'
    and role='store_owner' and state='active'),1::bigint,'fixture grants Owner A only on Store A');
select is((select count(*) from app_private.role_grants
  where subject_user_id='58100000-0000-4000-8000-000000000001' and role='representative' and state='active'),0::bigint,
  'Owner A has no active Representative overlap');
select is((select count(*) from app_private.role_grants
  where subject_user_id='58100000-0000-4000-8000-000000000001' and store_id='58100000-0000-4000-8000-000000000012'
    and role='store_owner' and state='active'),0::bigint,'Owner A receives no Store B authority');

select has_function('app_public','portal_edit_update',array['text','jsonb','bigint','text'],
  'Owner update edit RPC accepts target, draft, version and idempotency key');
select has_function('portal_private','expire_store_sales',array['timestamp with time zone','integer'],
  'sale expiry command accepts an injected clock and bounded batch');
select has_function('app_public','portal_expire_store_sales',array['timestamp with time zone','integer'],
  'sale expiry service wrapper is present');
select has_column('portal_private','store_updates','version','durable update version is available');
select ok(has_function_privilege('store_update_expiry_service',
  'app_public.portal_expire_store_sales(timestamp with time zone,integer)','EXECUTE'),
  'dedicated expiry service can invoke its wrapper');
select ok(not has_function_privilege('authenticated',
  'app_public.portal_expire_store_sales(timestamp with time zone,integer)','EXECUTE'),
  'browser roles cannot invoke the expiry worker');
select ok(not has_table_privilege('store_update_expiry_service','portal_private.store_updates','UPDATE'),
  'expiry service cannot directly mutate Store Update rows');
select ok(not has_function_privilege('store_update_expiry_service',
  'portal_private.expire_store_sales(timestamp with time zone,integer)','EXECUTE'),
  'expiry service can call only the worker wrapper');
select ok(not has_table_privilege('store_update_expiry_service','portal_private.store_updates','SELECT'),
  'expiry service cannot read Store Update rows directly');
select ok(not has_table_privilege('anon','portal_private.store_updates','SELECT')
  and not has_table_privilege('authenticated','portal_private.store_updates','SELECT')
  and not has_table_privilege('service_role','portal_private.store_updates','SELECT'),
  'public, browser and generic service roles have no direct Store Update table read');
select ok(has_column_privilege('catalog_reader','portal_private.store_updates','source_url','SELECT')
  and not has_column_privilege('catalog_reader','portal_private.store_updates','content_digest','SELECT')
  and not has_column_privilege('catalog_reader','portal_private.store_updates','author_user_id','SELECT')
  and not has_column_privilege('catalog_reader','portal_private.store_updates','state','SELECT'),
  'catalog reader can select only the safe Store Update projection columns');
select ok(not has_table_privilege('authenticated','portal_private.store_update_edit_receipts','SELECT')
  and not has_table_privilege('catalog_reader','portal_private.store_update_edit_receipts','SELECT')
  and not has_table_privilege('store_update_expiry_service','portal_private.store_update_edit_receipts','SELECT')
  and not has_table_privilege('service_role','portal_private.store_update_edit_receipts','SELECT'),
  'edit receipts remain private from browser, catalog and expiry roles');

create temporary table issue581_created(value jsonb);
create temporary table issue581_saved(value jsonb);
create temporary table issue581_replay(value jsonb);
create temporary table issue581_changed_key(value jsonb);
create temporary table issue581_stale(value jsonb);
create temporary table issue581_archived(value jsonb);
create temporary table issue581_archived_edit(value jsonb);
create temporary table issue581_sale(value jsonb);
create temporary table issue581_second(value jsonb);
create temporary table issue581_retry(value jsonb);
create temporary table issue581_projection_a(value jsonb);
create temporary table issue581_projection_b(value jsonb);
grant insert,select on issue581_projection_a,issue581_projection_b to catalog_reader;
grant select,insert on issue581_created,issue581_saved,issue581_replay,issue581_changed_key,issue581_stale,issue581_archived,issue581_archived_edit,issue581_sale,issue581_second,issue581_retry to authenticated;

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000001','58100000-0000-4000-8000-000000000004');
select set_config('request.headers','{"x-owner-store-id":"58100000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
insert into issue581_created
select app_public.portal_create_update(
  '{"type":"new_finds","headline":"First headline","details":"First body","imageRequested":false}'::jsonb);
select is((select value->>'version' from issue581_created),'1',
  'Owner create returns initial row version');
select is((select value->>'state' from issue581_created),'live',
  'text create publishes immediately');

insert into issue581_saved
select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Edited headline","details":"Edited body","sourceUrl":"https://example.test/issue-581","imageRequested":false}'::jsonb,
  1,'issue581-edit-a-v1');
select is((select value->>'state' from issue581_saved),'saved','valid Owner edit is acknowledged');
select is((select value->'update'->>'version' from issue581_saved),'2','edit increments version once');
select is((select value->'update'->>'headline' from issue581_saved),'Edited headline','edit returns acknowledged text');
select is((select value->'update'->>'publishedAt' from issue581_saved),
  (select value->>'publishedAt' from issue581_created),'edit preserves original publication time');

insert into issue581_replay
select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Edited headline","details":"Edited body","sourceUrl":"https://example.test/issue-581","imageRequested":false}'::jsonb,
  1,'issue581-edit-a-v1');
select is((select value from issue581_replay),(select value from issue581_saved),
  'same-key same-payload retry replays the acknowledged result');
select is((select version::text from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_created)),'2',
  'successful replay does not increment version again');
select is((select count(*)::integer from portal_private.portal_audit_events
  where resource_id=(select (value->>'id')::uuid from issue581_created) and event_kind='text_update_edited'),1,
  'successful replay adds no second edit audit');

insert into issue581_second
select app_public.portal_create_update(
  '{"type":"announcement","headline":"Second headline","details":"Second body","imageRequested":false}'::jsonb);
reset role;
update portal_private.store_updates set published_at='2030-03-01T12:00:00Z'::timestamptz
where update_id in (
  (select (value->>'id')::uuid from issue581_created),
  (select (value->>'id')::uuid from issue581_second)
);
select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000001','58100000-0000-4000-8000-000000000004');
set local role authenticated;
select is((app_public.portal_list_updates()->0->>'id'),
  (select greatest((select (value->>'id')::uuid from issue581_created),
                   (select (value->>'id')::uuid from issue581_second))::text),
  'Owner list orders equal publication times by update id descending');

set local role catalog_reader;
insert into issue581_projection_a
select to_jsonb(store_row) from app_public.catalog_details('issue-581-store-a') store_row;
insert into issue581_projection_b
select to_jsonb(store_row) from app_public.catalog_details('issue-581-store-b') store_row;
reset role;
select is((select update_item->>'title' from issue581_projection_a
  cross join lateral jsonb_array_elements(value->'updates') update_item
  where update_item->>'id'=(select value->>'id' from issue581_created)),
  'Edited headline','catalog detail projects live Store Updates');
select is((select update_item->>'href' from issue581_projection_a
  cross join lateral jsonb_array_elements(value->'updates') update_item
  where update_item->>'id'=(select value->>'id' from issue581_created)),
  'https://example.test/issue-581','catalog detail maps the safe source URL to href');
select ok((select count(*)=2 and bool_and(
  update_item ?& array['id','title','body','publishedAt']::text[]
  and not exists(select 1 from jsonb_object_keys(update_item) fields(key)
    where key not in ('id','title','body','publishedAt','href'))
) from issue581_projection_a cross join lateral jsonb_array_elements(value->'updates') update_item),
  'public update DTO contains only required fields and optional href');
select is((select value->'updates'->0->>'id' from issue581_projection_a),
  (select greatest((select (value->>'id')::uuid from issue581_created),
                   (select (value->>'id')::uuid from issue581_second))::text),
  'catalog projection orders equal publication times by update id descending');
select is((select value->'updates'->0->>'title' from issue581_projection_b),'Sibling update',
  'overdue sale is suppressed immediately from the public catalog projection');

set local role store_update_expiry_service;
select is(app_public.portal_expire_store_sales(statement_timestamp(),100),1,
  'bounded worker archives an overdue sale using the store local date');
select is(app_public.portal_expire_store_sales(statement_timestamp(),100),0,
  'repeated overdue-sale sweep is a no-op');
reset role;
select is((select state from portal_private.store_updates where update_id='58100000-0000-4000-8000-000000000018'),
  'archived','worker persists overdue sale expiry');
select is((select count(*)::integer from portal_private.portal_audit_events
  where resource_id='58100000-0000-4000-8000-000000000018' and event_kind='text_update_sale_expired'),1,
  'overdue sale expiry emits one audit event');

set local role authenticated;
insert into issue581_changed_key
select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Changed payload","details":"Must conflict","imageRequested":false}'::jsonb,
  1,'issue581-edit-a-v1');
select is((select value->>'state' from issue581_changed_key),'conflict',
  'same key with changed payload conflicts');
select is((select headline from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_created)),
  'Edited headline','changed-payload replay leaves content unchanged');

insert into issue581_stale
select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Stale overwrite","details":"Must remain local","imageRequested":false}'::jsonb,
  1,'issue581-edit-a-stale');
select is((select value->>'state' from issue581_stale),'conflict','stale version returns conflict');
select is((select value->'latest'->>'version' from issue581_stale),'2','stale conflict returns current version');
select throws_ok($$select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"sale","headline":"Missing date","details":"Invalid"}'::jsonb,
  2,'issue581-invalid-sale')$$,'22023','validation_failed','invalid sale cannot publish');
select throws_ok($$select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Image request","details":"Text path must fail closed","imageRequested":true}'::jsonb,
  2,'issue581-image-denied')$$,'22023','validation_failed','text edit path rejects image-bearing drafts');
select throws_ok($$select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Forged state","details":"Caller metadata is forbidden","state":"archived","storeId":"58100000-0000-4000-8000-000000000012"}'::jsonb,
  2,'issue581-forged-metadata')$$,'22023','validation_failed',
  'caller cannot supply update state or store context in the edit draft');
insert into issue581_retry
select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Retry after failed edit","details":"Failed edits do not reserve a key","imageRequested":false}'::jsonb,
  2,'issue581-image-denied');
select is((select value->>'state' from issue581_retry),'saved',
  'failed validation does not consume an idempotency key');

reset role;
select is((select headline from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_created)),
  'Retry after failed edit','failed and stale edits leave prior content intact before valid retry');
select is((select version::text from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_created)),
  '3','valid retry advances the version once after failed and stale edits');

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000013','58100000-0000-4000-8000-000000000014');
set local role authenticated;
select throws_ok($$select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Shopper overwrite","details":"Denied"}'::jsonb,
  3,'issue581-shopper-denied')$$,'42501','portal_unavailable','MFA Shopper cannot edit Owner updates');
reset role;

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000002','58100000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Admin overwrite","details":"Denied"}'::jsonb,
  3,'issue581-admin-denied')$$,'42501','portal_unavailable','separate MFA Site Admin cannot edit Owner updates');
reset role;

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000001','58100000-0000-4000-8000-000000000017');
set local role authenticated;
select throws_ok($$select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"No MFA overwrite","details":"Denied"}'::jsonb,
  3,'issue581-no-mfa-denied')$$,'42501','portal_unavailable','Owner session without verified MFA cannot edit');
reset role;

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000001','58100000-0000-4000-8000-000000000004');
select set_config('request.headers','{"x-owner-store-id":"58100000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
select throws_ok($$select app_public.portal_edit_update(
  '58100000-0000-4000-8000-000000000016',
  '{"type":"new_finds","headline":"Cross-store overwrite","details":"Denied","imageRequested":false}'::jsonb,
  1,'issue581-cross-store')$$,'55000','portal_unavailable','Owner A cannot edit a Store B update by changing client store context');
reset role;
select is((select headline from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_created)),
  'Retry after failed edit','cross-store denial leaves Store A unchanged');

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000001','58100000-0000-4000-8000-000000000004');
select set_config('request.headers','{"x-owner-store-id":"58100000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
insert into issue581_archived
select app_public.portal_archive_update((select value->>'id' from issue581_created));
select is((select value->>'state' from issue581_archived),'archived','Owner can archive an update');
select is((select value->>'version' from issue581_archived),'4','archive increments the update version');
insert into issue581_archived_edit
select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Archived edit","details":"Stays private until restore","imageRequested":false}'::jsonb,
  4,'issue581-edit-archived-v4');
select is((select value->'update'->>'state' from issue581_archived_edit),'archived',
  'editing an archived update keeps it archived');
select is((select value->'update'->>'version' from issue581_archived_edit),'5',
  'archived edit increments version');
reset role;
select is((select state from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_created)),
  'archived','archived edit cannot republish the row');
select is((select version::text from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_created)),
  '5','archived edit persists the expected version');

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000001','58100000-0000-4000-8000-000000000004');
select set_config('request.headers','{"x-owner-store-id":"58100000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
insert into issue581_sale
select app_public.portal_create_update(
  '{"type":"sale","headline":"Spring sale","details":"Expires after March 10","endDate":"2030-03-10","imageRequested":false}'::jsonb);
reset role;

set local role store_update_expiry_service;
select is(app_public.portal_expire_store_sales('2030-03-11T04:59:59Z'::timestamptz,100),0,
  'sale remains live through its Store A local end date');
select is(app_public.portal_expire_store_sales('2030-03-11T05:00:00Z'::timestamptz,100),1,
  'sale expires at the next America/Chicago local date');
select is(app_public.portal_expire_store_sales('2030-03-11T05:00:00Z'::timestamptz,100),0,
  'repeated expiry sweep is a no-op');
reset role;
select is((select state from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_sale)),
  'archived','expiry durably archives the sale');
select is((select version::text from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_sale)),
  '2','expiry increments row version');
select is((select count(*)::integer from portal_private.portal_audit_events
  where resource_id=(select (value->>'id')::uuid from issue581_sale) and event_kind='text_update_sale_expired'),1,
  'durable expiry emits one versioned audit event');
select is((select count(*)::integer from app_private.privileged_audit_events
  where resource_id=(select (value->>'id')::uuid from issue581_sale)
    and action='portal_text_update_sale_expired' and actor_user_id is null and actor_role is null),1,
  'scheduler audit is classified without inventing a human actor');
select is((select archived_at from portal_private.store_updates where update_id=(select (value->>'id')::uuid from issue581_sale)),
  '2030-03-11T05:00:00Z'::timestamptz,'expiry transition uses injected clock at the local date boundary');
select is((select occurred_at from portal_private.portal_audit_events
  where resource_id=(select (value->>'id')::uuid from issue581_sale) and event_kind='text_update_sale_expired'),
  '2030-03-11T05:00:00Z'::timestamptz,'expiry audit uses the same injected transition time');

update partner_private.store_partner_grants
set state='revoked',revoked_at=statement_timestamp(),revoked_by='58100000-0000-4000-8000-000000000001'
where auth_user_id='58100000-0000-4000-8000-000000000001'
  and store_id='58100000-0000-4000-8000-000000000011' and state='active';
select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000001','58100000-0000-4000-8000-000000000004');
set local role authenticated;
select throws_ok($$select app_public.portal_edit_update(
  (select value->>'id' from issue581_created),
  '{"type":"new_finds","headline":"Revoked Owner edit","details":"Denied"}'::jsonb,
  5,'issue581-revoked-owner')$$,'42501','portal_unavailable','revoked Owner grant cannot edit updates');
reset role;

select finish();
rollback;
