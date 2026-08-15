-- Keep private implementation calls owner-only and remove inherited PUBLIC
-- execution from browser-facing trip commands.
grant rg01_automation,identity_service to postgres;
grant create on schema rg01_private to rg01_automation;

alter function rg01_private.freeze_run_derived_core(uuid) owner to rg01_automation;
revoke all on function rg01_private.freeze_run_derived_core(uuid)
  from public,anon,authenticated,rg01_source_service,rg01_calculation_service,
    rg01_signature_service,rg01_lifecycle_service,rg01_evidence_service;

revoke all on function rg01_private.derive_source_fact(text,uuid)
  from public,anon,authenticated,service_role,rg01_source_service;

revoke all on function app_public.list_trips(),
  app_public.get_trip_collaboration(text),
  app_public.request_check_my_day(text),
  app_public.complete_trip(text),
  app_public.set_trip_limits(text,double precision,integer)
  from public,anon;

revoke create on schema rg01_private from rg01_automation;
revoke rg01_automation,identity_service from postgres;
