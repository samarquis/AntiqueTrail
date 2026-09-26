update public_test_private.runtime
set active_binding_id = (
  select binding_id from public_test_private.bindings
  where binding_id = '6c621ff6-5351-4384-a425-a95db0191598'
)
where id = 1;
