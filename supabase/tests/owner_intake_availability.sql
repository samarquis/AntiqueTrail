begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_function('app_public','owner_intake_availability',array[]::text[],
  'owner intake availability projection exists');
select ok(has_function_privilege('anon','app_public.owner_intake_availability()','EXECUTE'),
  'anonymous browsers can read only the bounded projection');
select ok(not has_table_privilege('anon','app_private.environment_stage','SELECT')
  and not has_table_privilege('anon','partner_private.store_application_capability','SELECT'),
  'anonymous browsers cannot read source authority tables');
select ok(position('public_capability_enabled' in pg_get_functiondef(
  'app_public.owner_intake_availability()'::regprocedure))>0
  and position('store_application_enabled' in pg_get_functiondef(
  'app_public.owner_intake_availability()'::regprocedure))>0,
  'projection uses the existing release and application authority helpers');
select ok(position('readiness' in lower(pg_get_functiondef(
  'app_public.owner_intake_availability()'::regprocedure)))=0,
  'projection exposes no readiness or receipt state');

select is(app_public.owner_intake_availability(),
  '{"claimsAvailable": false, "intakeAvailable": false, "routeVisible": false}'::jsonb,
  'synthetic-alpha pre-10A state is absent and intake is closed');

update app_private.environment_stage set stage='private_beta' where id=1;
select is(app_public.owner_intake_availability(),
  '{"claimsAvailable": false, "intakeAvailable": false, "routeVisible": true}'::jsonb,
  'private Package 10A exposes only the private noindex page');

insert into release_private.regional_releases(
  release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
values('25300000-0000-4000-8000-000000000001','topeka-ks','sha256:'||repeat('1',64),
  'sha256:'||repeat('2',64),'sha256:'||repeat('3',64),'active');
insert into release_private.release_capabilities(
  release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion)
-- release_capabilities is intentionally atomic: a public release enables the
-- complete public capability set, while a non-public release enables none.
values('25300000-0000-4000-8000-000000000001',true,true,true,true,true);
update partner_private.store_application_capability set public_store_applications_enabled=true where id;
update app_private.environment_stage set stage='regional_public' where id=1;
select is(app_public.owner_intake_availability(),
  '{"claimsAvailable": true, "intakeAvailable": true, "routeVisible": true}'::jsonb,
  'signed public claims and application authority expose the public intake');

update release_private.regional_releases set state='rolled_back'
where release_id='25300000-0000-4000-8000-000000000001';
select is(app_public.owner_intake_availability(),
  '{"claimsAvailable": false, "intakeAvailable": false, "routeVisible": false}'::jsonb,
  'withdrawn public authority hides the public route and closes intake');

select * from finish();
rollback;
