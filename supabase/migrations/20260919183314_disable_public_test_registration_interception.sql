-- Production registration is governed by account_registration_config and the
-- quarantine latch. Public-test wrappers must remain dormant on this target.
update public_test_private.runtime
set first_started_at = null,
    active_binding_id = null
where id = 1;

do $$
begin
  if exists (
    select 1 from public_test_private.runtime
    where id = 1 and (first_started_at is not null or active_binding_id is not null)
  ) then
    raise exception 'public_test_registration_interception_still_active';
  end if;
end
$$;
