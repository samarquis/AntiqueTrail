-- Final Candidate boundary hardening and bounded owner lifecycle commands.

grant identity_service to postgres;
grant create on schema app_public to identity_service;

alter table candidate_private.candidate_lifecycle_receipts
  drop constraint candidate_lifecycle_receipts_subject_kind_check;
alter table candidate_private.candidate_lifecycle_receipts
  add constraint candidate_lifecycle_receipts_subject_kind_check
  check (subject_kind in ('trip_idea','candidate_block','candidate_share'));
alter table candidate_private.candidate_lifecycle_receipts
  drop constraint candidate_lifecycle_receipts_action_check;
alter table candidate_private.candidate_lifecycle_receipts
  add constraint candidate_lifecycle_receipts_action_check
  check (action in ('deleted','updated','unblocked','revoked'));

create or replace function app_public.candidate_edge_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  candidate_role text:=coalesce(auth.jwt()->'app_metadata'->>'role','Shopper');
begin
  if actor is null or not app_private.current_session_is_active()
    or candidate_role not in ('Shopper','Representative','Administrator') then
    return jsonb_build_object('active',false,'role','none');
  end if;
  return jsonb_build_object('active',true,'role',candidate_role,'userId',actor);
end
$$;

create or replace function app_public.candidate_update_trip_idea(
  p_idea_id uuid,p_title text,p_url_note text,p_expected_version bigint
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); idea_row candidate_private.trip_ideas%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='candidate_auth_required';
  end if;
  if nullif(btrim(p_title),'') is null or char_length(p_title)>160 or p_title ~ '[[:cntrl:]]'
    or char_length(coalesce(p_url_note,''))>4096 or coalesce(p_url_note,'') ~ '[[:cntrl:]]'
    or p_expected_version<1 then
    raise exception using errcode='22023',message='candidate_idea_input_invalid';
  end if;
  update candidate_private.trip_ideas set title=btrim(p_title),url_note=nullif(p_url_note,''),
    version=version+1,updated_at=statement_timestamp()
  where idea_id=p_idea_id and owner_user_id=actor and version=p_expected_version
  returning * into idea_row;
  if not found then raise exception using errcode='55000',message='candidate_idea_unavailable'; end if;
  insert into candidate_private.candidate_lifecycle_receipts(
    actor_user_id,subject_kind,action,subject_digest
  ) values (
    actor,'trip_idea','updated',extensions.digest(convert_to(p_idea_id::text,'UTF8'),'sha256')
  );
  return jsonb_build_object('id',idea_row.idea_id,'ownerUserId',idea_row.owner_user_id,
    'sourceShareId',idea_row.source_share_id,'title',idea_row.title,
    'urlNote',coalesce(idea_row.url_note,''),'version',idea_row.version);
end
$$;

create or replace function app_public.unblock_candidate_sender(
  p_blocked_user_id uuid,p_confirmed boolean
) returns void language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='candidate_auth_required';
  end if;
  if p_confirmed is not true or p_blocked_user_id is null or p_blocked_user_id=actor then
    raise exception using errcode='22023',message='candidate_unblock_confirmation_required';
  end if;
  delete from candidate_private.candidate_blocks
    where blocker_id=actor and blocked_user_id=p_blocked_user_id;
  if not found then raise exception using errcode='55000',message='candidate_block_unavailable'; end if;
  insert into candidate_private.candidate_lifecycle_receipts(
    actor_user_id,subject_kind,action,subject_digest
  ) values (
    actor,'candidate_block','unblocked',
    extensions.digest(convert_to(p_blocked_user_id::text,'UTF8'),'sha256')
  );
end
$$;

create or replace function app_public.revoke_candidate_share(
  p_share_id uuid,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); share_row candidate_private.candidate_shares%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='candidate_auth_required';
  end if;
  if p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='candidate_revoke_input_invalid';
  end if;
  if exists(select 1 from candidate_private.candidate_share_actions
    where share_id=p_share_id and actor_user_id=actor and action='revoke'
      and idempotency_key=p_idempotency_key) then
    return jsonb_build_object('accepted',false,'state','closed','message','Closed');
  end if;
  select * into share_row from candidate_private.candidate_shares
    where share_id=p_share_id for update;
  if not found or share_row.sender_id is distinct from actor or share_row.state<>'pending' then
    raise exception using errcode='55000',message='candidate_share_unavailable';
  end if;
  update candidate_private.candidate_shares set state='closed',close_reason='revoked',
    closed_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp()
    where share_id=p_share_id;
  insert into candidate_private.candidate_share_actions(
    share_id,actor_user_id,action,idempotency_key,from_state,to_state
  ) values (p_share_id,actor,'revoke',p_idempotency_key,'pending','closed');
  insert into candidate_private.candidate_lifecycle_receipts(
    actor_user_id,subject_kind,action,subject_digest
  ) values (
    actor,'candidate_share','revoked',extensions.digest(convert_to(p_share_id::text,'UTF8'),'sha256')
  );
  return jsonb_build_object('accepted',false,'state','closed','message','Closed');
end
$$;

alter function app_public.candidate_edge_context() owner to identity_service;
alter function app_public.candidate_update_trip_idea(uuid,text,text,bigint) owner to identity_service;
alter function app_public.unblock_candidate_sender(uuid,boolean) owner to identity_service;
alter function app_public.revoke_candidate_share(uuid,text) owner to identity_service;

revoke all on function app_public.candidate_edge_context(),
  app_public.candidate_update_trip_idea(uuid,text,text,bigint),
  app_public.unblock_candidate_sender(uuid,boolean),
  app_public.revoke_candidate_share(uuid,text) from public,anon;
grant execute on function app_public.candidate_edge_context(),
  app_public.candidate_update_trip_idea(uuid,text,text,bigint),
  app_public.unblock_candidate_sender(uuid,boolean),
  app_public.revoke_candidate_share(uuid,text) to authenticated;

revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
