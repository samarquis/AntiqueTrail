-- Deferred trip triggers fired at COMMIT outside the create/add-stop
-- SECURITY DEFINER bubble, so invoker functions owned by postgres executed as
-- `authenticated`, which lacks USAGE on trip_private -> 42501
-- "permission denied for schema trip_private" (HTTP-only; DB probes rolled
-- back before commit, so deferred triggers never fired there).
-- Fix: make the three validators SECURITY DEFINER; deferral semantics
-- unchanged. Ownership intentionally left as postgres.
-- NOTE: applied manually as postgres via the pooler because the db-push login
-- role cannot resolve trip_private objects; recorded with migration repair.
alter function trip_private.validate_trip_navigator_assignment() security definer;
alter function trip_private.enforce_trip_stop_limit() security definer;
alter function trip_private.validate_trip_binding_removal() security definer;

revoke all on function trip_private.validate_trip_navigator_assignment() from public;
revoke all on function trip_private.enforce_trip_stop_limit() from public;
revoke all on function trip_private.validate_trip_binding_removal() from public;

grant execute on function trip_private.validate_trip_navigator_assignment() to authenticated, service_role;
grant execute on function trip_private.enforce_trip_stop_limit() to authenticated, service_role;
grant execute on function trip_private.validate_trip_binding_removal() to authenticated, service_role;
