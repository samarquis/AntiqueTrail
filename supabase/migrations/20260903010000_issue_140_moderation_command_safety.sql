-- Issue #140: bind moderation decisions to one case version and one retry key.

create table review_private.moderation_command_receipts (
  idempotency_key text primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  case_id uuid not null references review_private.moderation_cases(case_id) on delete restrict,
  input_digest bytea not null check (octet_length(input_digest)=32),
  result jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint moderation_command_key_safe check (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  )
);
alter table review_private.moderation_command_receipts enable row level security;
alter table review_private.moderation_command_receipts force row level security;
revoke all on review_private.moderation_command_receipts from public,anon,authenticated;
grant select,insert on review_private.moderation_command_receipts to review_automation;
grant usage on schema release_private to review_automation;
create policy review_automation_moderation_command_receipts
  on review_private.moderation_command_receipts for all to review_automation
  using (true) with check (true);

grant review_automation to postgres;
grant usage,create on schema app_public to review_automation;
set role review_automation;

create or replace function app_public.reviews_list_moderation_cases() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_review_admin(); claimed uuid; result jsonb;
begin
  select case_id into claimed from review_private.moderation_cases
    where assigned_admin_id is null and state='open' order by opened_at for update skip locked limit 1;
  if claimed is not null then
    update review_private.moderation_cases set assigned_admin_id=actor,updated_at=statement_timestamp(),version=version+1 where case_id=claimed;
    perform review_private.append_audit('moderation_case_claimed',actor,null,claimed,'allowed','{}'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.case_id,'version',c.version,'reviewId',c.review_id,'storeId',c.store_id,'state',c.state,
      'reasonCode',c.reason_code,'evidence',coalesce((select jsonb_agg(jsonb_build_object('kind',e.evidence_kind,'value',e.evidence_value) order by e.created_at)
        from review_private.moderation_case_evidence e where e.case_id=c.case_id),'[]'::jsonb),
      'openedAt',c.opened_at,'updatedAt',c.updated_at) order by c.opened_at),'[]'::jsonb)
    into result from review_private.moderation_cases c where c.assigned_admin_id=actor and c.state in ('open','held','removed','appealed');
  return result;
end $$;

create or replace function app_public.reviews_moderate(
  p_case_id uuid,p_action text,p_reason text,p_expected_version bigint,p_idempotency_key text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=review_private.require_review_admin();
  c review_private.moderation_cases%rowtype;
  r review_private.public_reviews%rowtype;
  prior review_private.moderation_command_receipts%rowtype;
  next_case text; next_review text; digest bytea; response jsonb;
begin
  if p_action not in ('hold','remove','restore','dismiss_report')
    or nullif(btrim(p_reason),'') is null or char_length(p_reason)>1000
    or p_expected_version<1
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='review_moderation_input_invalid';
  end if;
  digest:=extensions.digest(convert_to(concat_ws('|',actor,p_case_id,p_action,btrim(p_reason),p_expected_version),'utf8'),'sha256');
  -- Serialize every use of a retry key before reading its receipt. Without this,
  -- two concurrent first attempts can both miss the receipt and mutate the case.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  select * into prior from review_private.moderation_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.case_id<>p_case_id or prior.input_digest<>digest then
      raise exception using errcode='22023',message='review_moderation_idempotency_reused';
    end if;
    return prior.result;
  end if;
  select * into c from review_private.moderation_cases where case_id=p_case_id for update;
  if not found or c.assigned_admin_id<>actor or c.version<>p_expected_version
    or c.state not in ('open','held','removed') then
    raise exception using errcode='42501',message='review_moderation_denied';
  end if;
  select * into r from review_private.public_reviews where review_id=c.review_id for update;
  if p_action='hold' then next_case:='held'; next_review:='held';
  elsif p_action='remove' then next_case:='removed'; next_review:='removed';
  elsif p_action='restore' then next_case:='restored'; next_review:='published';
  else next_case:='dismissed'; next_review:=case when r.state='held' then 'published' else r.state end; end if;
  update review_private.public_reviews set state=next_review,updated_at=statement_timestamp(),version=version+1 where review_id=r.review_id returning * into r;
  update review_private.moderation_cases set state=next_case,original_moderator_id=coalesce(original_moderator_id,actor),
    decided_at=statement_timestamp(),closed_at=case when next_case in ('restored','dismissed') then statement_timestamp() end,
    updated_at=statement_timestamp(),version=version+1 where case_id=c.case_id returning * into c;
  insert into review_private.moderation_case_evidence(case_id,evidence_kind,evidence_value,source_digest)
    values(c.case_id,'prior_decision',p_action,extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'));
  perform review_private.rebuild_rating_aggregate(r.store_id);
  perform review_private.sync_public_projection(r.review_id);
  perform review_private.append_audit('review_moderated',actor,r.review_id,c.case_id,'allowed',jsonb_build_object('action',p_action,'reasonDigest',encode(extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'),'hex')));
  response:=jsonb_build_object('id',c.case_id,'version',c.version,'reviewId',c.review_id,'storeId',c.store_id,'state',c.state,'reasonCode',c.reason_code,
    'evidence','[]'::jsonb,'openedAt',c.opened_at,'updatedAt',c.updated_at);
  insert into review_private.moderation_command_receipts(idempotency_key,actor_user_id,case_id,input_digest,result)
    values(p_idempotency_key,actor,c.case_id,digest,response);
  return response;
end $$;

revoke all on function app_public.reviews_moderate(uuid,text,text) from authenticated;
revoke all on function app_public.reviews_moderate(uuid,text,text,bigint,text) from public,anon;
grant execute on function app_public.reviews_moderate(uuid,text,text,bigint,text) to authenticated;

reset role;
revoke usage,create on schema app_public from review_automation;
revoke review_automation from postgres;
