-- Local-only stage fixtures in a new run-owned database. No hosted receipt is asserted.
-- Normal GoTrue identities and application registration are established by the runner.
update app_private.environment_stage set stage='synthetic_alpha',
  receipt_id='24300000-0000-4000-8000-000000000001',
  capabilities=capabilities||'{"private_auth":true}'::jsonb where id=1;
update app_private.account_registration_config set mode='receipt_only',
  stage_receipt_id='24300000-0000-4000-8000-000000000001' where id=1;
update app_private.registration_quarantine_latch set state='open' where id=1;
