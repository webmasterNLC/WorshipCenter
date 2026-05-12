-- 0016_jwt_hook_security_definer_fix.sql
-- HOTFIX for 0015: custom_access_token_hook was created SECURITY INVOKER
-- by default. gotrue calls it as supabase_auth_admin, which has no
-- SELECT on public.profiles. Every /token request 500'd with
-- "permission denied for table profiles" — login + refresh_token both
-- broken in production. Switching to SECURITY DEFINER lets the function
-- read profiles using its owner's (postgres) privileges. Safe: the
-- function only reads its own narrow slice and writes nothing.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id  uuid;
  v_role     text;
  v_claims   jsonb;
  v_app_meta jsonb;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := event -> 'claims';

  select p.role::text into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role is not null then
    v_app_meta := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);
    v_app_meta := jsonb_set(v_app_meta, '{role}', to_jsonb(v_role));
    v_claims   := jsonb_set(v_claims, '{app_metadata}', v_app_meta);
  end if;

  return jsonb_build_object('claims', v_claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
