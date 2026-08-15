-- Runtime roles need schema lookup only. Function/table privileges remain explicit.
grant usage on schema auth to identity_service;
grant usage on schema app_public to service_role;

