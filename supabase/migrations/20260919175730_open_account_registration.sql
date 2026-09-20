-- Open shopper registration after the hosted registration safeguards have been
-- provisioned. Keep the quarantine latch and cleanup invariant fail-closed.
update app_private.account_registration_config
set mode = 'public',
    version = version + 1,
    updated_at = statement_timestamp()
where id = 1
  and mode in ('closed', 'receipt_only')
  and exists (
    select 1
    from app_private.registration_quarantine_latch
    where id = 1 and state = 'open'
  )
  and not exists (
    select 1
    from app_private.registration_cleanup_tickets
    where state <> 'completed_absent'
  );

do $$
begin
  if not exists (
    select 1 from app_private.account_registration_config where id = 1 and mode = 'public'
  ) then
    raise exception 'account_registration_safeguards_not_ready';
  end if;
end
$$;
