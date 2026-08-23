-- register_current_session failed at runtime with 42702 (column reference "session_id"
-- is ambiguous): the function declared a plpgsql variable named session_id that
-- collides with app_private.active_sessions.session_id in the INSERT target list.
-- Recreate with prefixed locals; logic identical to 20260820400000.
-- lend CREATE to identity_service only for this replacement; 20260820400000 revoked it
begin;
grant create on schema app_public to identity_service;
do $wrap$
begin
  perform set_config('role', 'identity_service', true);
  execute $fn$
create or replace function app_public.register_current_session(access_token_expires_at bigint)
returns boolean language plpgsql security definer set search_path='' as $body$
declare
  v_actor uuid:=app_public.request_user_id();
  v_session uuid:=app_private.claim_session_id();
  v_epoch bigint; v_expires timestamptz; v_provider_created timestamptz; v_revoked_before timestamptz;
begin
  if v_actor is null or v_session is null then raise exception 'authentication_required'; end if;
  if access_token_expires_at<=(extract(epoch from statement_timestamp())*1000)::bigint
    or access_token_expires_at>(extract(epoch from statement_timestamp()+interval '24 hours')*1000)::bigint
    then raise exception 'session_expiry_invalid'; end if;
  v_expires:=to_timestamp(access_token_expires_at::numeric/1000);
  v_provider_created:=app_private.provider_session_created_at(v_session,v_actor);
  if v_provider_created is null then raise exception 'provider_session_unavailable'; end if;
  select session_epoch,sessions_revoked_before into v_epoch,v_revoked_before
    from app_private.profiles where user_id=v_actor and status='active' for update;
  if v_epoch is null then raise exception 'account_unavailable'; end if;
  if not exists(select 1 from app_private.role_grants
    where subject_user_id=v_actor and role='shopper' and state='active') then raise exception 'admission_required'; end if;
  if v_revoked_before is not null and v_provider_created<=v_revoked_before then raise exception 'provider_session_revoked'; end if;
  insert into app_private.active_sessions(
    session_id,user_id,provider_created_at,session_epoch,state,last_authenticated_at,access_token_expires_at
  ) values(v_session,v_actor,v_provider_created,v_epoch,'active',v_provider_created,v_expires)
  on conflict (session_id) do update set
    access_token_expires_at=excluded.access_token_expires_at,
    version=app_private.active_sessions.version+1
  where app_private.active_sessions.user_id=excluded.user_id
    and app_private.active_sessions.session_epoch=excluded.session_epoch
    and app_private.active_sessions.provider_created_at=excluded.provider_created_at
    and app_private.active_sessions.state='active';
  return app_private.current_session_is_active();
end
$body$;
  $fn$;
  execute $priv$revoke all on function app_public.register_current_session(bigint) from public, anon$priv$;
  execute $priv$grant execute on function app_public.register_current_session(bigint) to authenticated$priv$;
  perform set_config('role', 'none', true);
end
$wrap$;
revoke create on schema app_public from identity_service;
commit;
