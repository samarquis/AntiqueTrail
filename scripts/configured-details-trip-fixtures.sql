-- Explicit opt-in for Details and connected-shopper proof in a run-owned database.
-- Do not repair or replace missing admission evidence here.
begin;
do $$
begin
 if internal_review_private.is_internal(null) or not exists (
   select 1 from app_private.environment_stage e
   join app_private.account_registration_config c on c.id=1
   join app_private.registration_quarantine_latch q on q.id=1
   where e.id=1 and e.stage='synthetic_alpha' and e.receipt_id is not null
     and e.capabilities @> '{"private_auth":true}'::jsonb
     and c.mode='receipt_only' and c.stage_receipt_id=e.receipt_id and q.state='open'
 ) then raise exception 'details_fixture_admission_missing'; end if;
 update app_private.environment_stage
 set capabilities=capabilities||'{"anonymous_catalog":true}'::jsonb where id=1;
end $$;
commit;
