-- ADR0008: admit the configured client's owned-store draft planning command.
grant internal_review_guard to postgres;
grant create on schema internal_review_private to internal_review_guard;
alter function internal_review_private.planning_path(text) owner to postgres;
create or replace function internal_review_private.planning_path(p_path text)
returns boolean language sql immutable set search_path='' as $$
  select p_path in ('rpc/shopper_list_saved','rpc/shopper_save_state','rpc/shopper_set_save',
    'rpc/shopper_list_memories','rpc/shopper_get_memory','rpc/shopper_upsert_memory',
    'rpc/shopper_delete_memory','rpc/shopper_undo_delete_memory',
    'rpc/list_trips','rpc/get_trip','rpc/create_trip','rpc/add_trip_stop','rpc/add_trip_store_stop',
    'rpc/reorder_trip_stop','rpc/rename_trip','rpc/remove_trip_stop','rpc/set_trip_stop_priority',
    'rpc/set_trip_stop_dwell','rpc/update_trip_schedule');
$$;
alter function internal_review_private.planning_path(text) owner to internal_review_guard;
revoke create on schema internal_review_private from internal_review_guard;
revoke internal_review_guard from postgres;
notify pgrst,'reload schema';
