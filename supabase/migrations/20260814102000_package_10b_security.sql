do $$ declare t text; begin
  foreach t in array array['regional_releases','release_commands','release_evidence_receipts','release_capabilities'] loop
    execute format('alter table release_private.%I enable row level security',t);
    execute format('alter table release_private.%I force row level security',t);
    execute format('revoke all on release_private.%I from public,anon,authenticated,release_executor',t);
  end loop;
end $$;
grant select,insert,update on release_private.regional_releases,release_private.release_capabilities to release_automation;
grant select,insert on release_private.release_commands to release_automation;
grant select on release_private.release_evidence_receipts to release_automation;
grant insert on release_private.release_evidence_receipts to release_evidence_service;
create policy release_automation_releases on release_private.regional_releases for all to release_automation using(true) with check(true);
create policy release_automation_capabilities on release_private.release_capabilities for all to release_automation using(true) with check(true);
create policy release_automation_commands on release_private.release_commands for select to release_automation using(true);
create policy release_automation_command_insert on release_private.release_commands for insert to release_automation with check(true);
create policy release_automation_evidence_read on release_private.release_evidence_receipts for select to release_automation using(true);
create policy release_evidence_insert on release_private.release_evidence_receipts for insert to release_evidence_service with check(true);
