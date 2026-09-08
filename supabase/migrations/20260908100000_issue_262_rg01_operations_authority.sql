-- Issue 262: separate the retained Operations preparation authority from the
-- Product Owner decision authority and expose only a bounded aggregate view.

create or replace function rg01_private.has_current_evidence_responsibility(p_responsibility text)
returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.current_session_is_active()
    and app_private.current_user_has_role('administrator'::app_private.app_role,null)
    and exists(
      select 1 from readiness_private.evidence_responsibility_grants g
      where g.user_id=app_public.request_user_id()
        and g.responsibility=p_responsibility
        and g.state='active'
    )
$$;

create or replace function rg01_private.has_live_operations_authority()
returns boolean
language sql stable security definer set search_path='' as $$
  select rg01_private.has_current_evidence_responsibility('Operations')
    and rg01_private.bound_release_id() is not null
    and exists(
      select 1 from readiness_private.evidence_responsibility_grants g
      where g.user_id=app_public.request_user_id()
        and g.responsibility='Operations'
        and g.state='active'
        and g.release_id=rg01_private.bound_release_id()
    )
$$;

create or replace function rg01_private.operational_run_projection(p_run_id uuid)
returns jsonb
language sql stable security definer set search_path='' as $$
  select case when r.run_id is null then null else jsonb_build_object(
    'runId',r.run_id,
    'state',r.state,
    'windowStart',r.window_start,
    'windowEnd',r.window_end,
    'sourceCutoff',r.source_cutoff,
    'currentSource',r.source_head_digest is not null and r.source_head_digest=rg01_private.source_head_digest(),
    'manifestDigest',case when r.manifest_digest is null then null else encode(r.manifest_digest,'hex') end,
    'blockers',coalesce(r.blockers,array[]::text[]),
    'metrics',coalesce((
      select jsonb_object_agg(m.metric_code,m.metric_value)
      from rg01_private.rg01_metrics m
      where m.run_id=r.run_id
        and m.metric_code=any(array[
          'first_trip_shoppers','second_trip_shoppers','active_listings','current_listings',
          'flyer_locations','open_critical_defects','new_support_cases','qualifying_trips',
          'claim_approved','claim_rejected','claim_abusive'
        ]::text[])
    ),'{}'::jsonb),
    'receiptId',r.receipt_id,
    'receiptStatus',case when r.state='signed' then 'signed' when r.state='rejected' then 'rejected' else 'none' end,
    'supersedesReceiptId',r.supersedes_receipt_id,
    'supersessionStatus',case
      when exists(select 1 from rg01_private.rg01_receipt_supersessions s where s.prior_receipt_id=r.receipt_id) then 'superseded'
      when r.supersedes_receipt_id is not null then 'supersedes'
      else 'none' end,
    'linkagePurgeDueAt',purge.due_at,
    'purgeStatus',case
      when exists(select 1 from rg01_private.rg01_purge_receipts p where p.run_id=r.run_id) then 'purged'
      when purge.due_at is null then 'not_due'
      when purge.due_at<statement_timestamp() then 'overdue'
      else 'due' end,
    'linkagePurged',exists(select 1 from rg01_private.rg01_purge_receipts p where p.run_id=r.run_id)
  ) end
  from rg01_private.rg01_runs r
  left join lateral (
    select min(s.linkage_purge_due_at) due_at
    from rg01_private.rg01_subject_consents s
    where s.linkage_purged_at is null and s.linkage_purge_due_at is not null
      and exists(select 1 from rg01_private.rg01_run_subjects rs where rs.run_id=r.run_id and rs.subject_id=s.subject_id)
  ) purge on true
  where r.run_id=p_run_id
$$;

create or replace function app_public.rg01_get_operational_status(p_run_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare latest_id uuid; runs jsonb;
  can_prepare boolean:=rg01_private.has_current_evidence_responsibility('Operations');
  can_sign boolean:=rg01_private.has_current_evidence_responsibility('ProductOwner');
  cap rg01_private.rg01_capability%rowtype;
begin
  if not can_prepare and not can_sign then
    raise exception using errcode='42501',message='rg01_evidence_responsibility_required';
  end if;
  select * into cap from rg01_private.rg01_capability where singleton_id=1;
  select r.run_id into latest_id from rg01_private.rg01_runs r order by r.created_at desc limit 1;
  select coalesce(jsonb_agg(rg01_private.operational_run_projection(x.run_id) order by x.created_at desc),'[]'::jsonb)
    into runs
    from (select r.run_id,r.created_at from rg01_private.rg01_runs r order by r.created_at desc limit 25) x;
  return jsonb_build_object(
    'collectionEnabled',cap.collection_enabled and rg01_private.release_is_active(cap.release_id),
    'permissions',jsonb_build_object('prepare',can_prepare and rg01_private.has_live_operations_authority(),
      'freeze',can_prepare and rg01_private.has_live_operations_authority(),'sign',can_sign),
    'run',rg01_private.operational_run_projection(coalesce(p_run_id,latest_id)),
    'runs',runs
  );
end $$;

create or replace function app_public.rg01_authorize_operational_command(p_operation text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_operation in ('begin','freeze') and rg01_private.has_live_operations_authority() then
    return jsonb_build_object('authorized',true,'operation',p_operation);
  end if;
  if p_operation='consume_decision'
    and rg01_private.has_current_evidence_responsibility('ProductOwner')
    and rg01_private.bound_release_id() is not null then
    return jsonb_build_object('authorized',true,'operation',p_operation);
  end if;
  raise exception using errcode='42501',message='rg01_operational_authority_required';
end $$;

alter function rg01_private.has_current_evidence_responsibility(text) owner to postgres;
alter function rg01_private.has_live_operations_authority() owner to postgres;
alter function rg01_private.operational_run_projection(uuid) owner to postgres;
alter function app_public.rg01_get_operational_status(uuid) owner to postgres;
alter function app_public.rg01_authorize_operational_command(text) owner to postgres;
revoke all on function rg01_private.has_current_evidence_responsibility(text),rg01_private.has_live_operations_authority(),rg01_private.operational_run_projection(uuid) from public,anon,authenticated;
revoke all on function app_public.rg01_get_operational_status(uuid),app_public.rg01_authorize_operational_command(text) from public,anon;
grant execute on function app_public.rg01_get_operational_status(uuid),app_public.rg01_authorize_operational_command(text) to authenticated;
