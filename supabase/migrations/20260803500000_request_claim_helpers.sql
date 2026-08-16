-- App-owned equivalents of Supabase's request-claim helpers. Runtime function
-- owners can resolve these without receiving access to the managed auth schema.
create or replace function app_public.request_user_id() returns uuid
language sql stable set search_path=pg_catalog as $$
  select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid
$$;

create or replace function app_public.request_jwt() returns jsonb
language sql stable set search_path=pg_catalog as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;

-- Like Supabase's app_public.request_user_id()/app_public.request_jwt(), these expose only the current request's
-- own claims and are safe for policies and constrained SECURITY DEFINER owners.
grant execute on function app_public.request_user_id(),app_public.request_jwt() to public;
