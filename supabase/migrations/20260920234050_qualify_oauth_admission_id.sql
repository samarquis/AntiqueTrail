-- Avoid PL/pgSQL variable/column ambiguity in the OAuth admission boundary.
create or replace function app_public.oauth_admission_check()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admission_id_text text;
begin
  select raw_user_meta_data ->> 'antique_trail_admission_id'
    into admission_id_text
    from auth.users
    where id = auth.uid();
  if admission_id_text is null then
    return jsonb_build_object('state', 'blocked');
  end if;
  begin
    if exists (
      select 1
      from app_private.account_admission_receipts r
      where r.admission_id = admission_id_text::uuid
        and r.provider_user_id = auth.uid()
        and r.state = 'active'
    ) then
      return jsonb_build_object('state', 'active');
    end if;
  exception when invalid_text_representation then
    return jsonb_build_object('state', 'blocked');
  end;
  return jsonb_build_object('state', 'blocked');
end;
$$;
