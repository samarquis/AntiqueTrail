alter function release_private.freeze_regional_release(uuid,text,text,text) owner to release_automation;
alter function release_private.rollback_regional_release(uuid,uuid,text) owner to release_automation;
alter function release_private.promote_regional_release(uuid,uuid,uuid[]) owner to release_automation;
revoke all on all functions in schema release_private from public,anon,authenticated;
grant execute on function release_private.freeze_regional_release(uuid,text,text,text) to release_executor;
grant execute on function release_private.rollback_regional_release(uuid,uuid,text) to release_executor;
grant execute on function release_private.promote_regional_release(uuid,uuid,uuid[]) to release_executor;
revoke release_automation from postgres;
