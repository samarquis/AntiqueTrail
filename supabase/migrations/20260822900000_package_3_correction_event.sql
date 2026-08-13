-- Package 3: every correction report starts with an immutable submitted event.
create or replace function app_public.shopper_submit_correction(
  p_store_id uuid,p_type text,p_description text,p_public_source_url text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare report shopper_private.store_correction_reports%rowtype;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  if not exists(
    select 1 from app_public.stores s where s.id=p_store_id
      and s.synthetic and s.audience='synthetic' and s.publication_state='active'
  ) then raise exception using errcode='22023', message='store_not_available'; end if;
  insert into shopper_private.store_correction_reports(
    reporter_user_id,store_id,correction_type,description,public_source_url
  ) values(
    auth.uid(),p_store_id,p_type,btrim(p_description),nullif(btrim(p_public_source_url),'')
  ) returning * into report;
  insert into shopper_private.correction_case_events(
    report_id,actor_user_id,event_kind,to_state,idempotency_key
  ) values (
    report.report_id,auth.uid(),'submitted','submitted','submitted:'||report.report_id::text
  ) on conflict (report_id,idempotency_key) do nothing;
  return jsonb_build_object('id',report.report_id,'state',report.state);
end; $$;

alter function app_public.shopper_submit_correction(uuid,text,text,text) owner to identity_service;
revoke all on function app_public.shopper_submit_correction(uuid,text,text,text) from public, anon;
grant execute on function app_public.shopper_submit_correction(uuid,text,text,text) to authenticated;
