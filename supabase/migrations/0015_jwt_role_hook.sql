-- 0015_jwt_role_hook.sql — push the user's role into the JWT.
--
-- WHY: every RLS policy calls public.role_of(auth.uid()), which today
-- runs `select role from profiles where id = uid` once per row context.
-- For pages that hit 5+ tables with RLS, that's 5+ profile lookups
-- *per query*. Moving the role into the JWT app_metadata claim makes
-- role_of() a string read on a value already in memory: zero DB hops.
--
-- HOW: Supabase's "Custom Access Token Hook" is a Postgres function
-- that gotrue calls when minting a JWT (at sign-in and at refresh).
-- It can mutate the claims dict. We inject `app_metadata.role` =
-- the user's current profiles.role.
--
-- role_of() is rewritten to read from the JWT first, with a DB
-- fallback for stale tokens (sessions issued before this hook was
-- enabled or before the role last changed).
--
-- TOKEN EVENTUAL CONSISTENCY: a role change in profiles takes effect
-- in the JWT only at the next token refresh (Supabase default: 1h).
-- For a worship app this is acceptable. If a hot demotion is needed,
-- call auth.admin.signOutUser(id) from a server action to force
-- re-auth.
--
-- DASHBOARD STEP (one-time, manual): after this migration runs, go to
--   Supabase Dashboard → Authentication → Hooks → Send-SMS / Custom
--   Access Token → enable "Custom Access Token Hook" → select
--   public.custom_access_token_hook
-- The function exists immediately but is not invoked until the hook
-- is wired in the dashboard.

----------------------------------------------------------------------
-- 1. The hook function — called by gotrue at JWT mint time.
----------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
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

-- Only gotrue's service role should invoke this. Lock everyone else out.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

----------------------------------------------------------------------
-- 2. role_of() reads from JWT for the calling user, falls back to DB.
----------------------------------------------------------------------
create or replace function public.role_of(uid uuid) returns user_role
language sql
stable
security invoker
set search_path = public
as $$
  select case
    -- Self-lookup: use the JWT claim if present (zero DB lookup).
    when uid = (select auth.uid()) then
      coalesce(
        nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')::public.user_role,
        (select role from public.profiles where id = uid)
      )
    -- Other-user lookup: always DB (rare, used only when an admin
    -- inspects someone else; correctness over speed).
    else
      (select role from public.profiles where id = uid)
  end;
$$;

revoke all on function public.role_of(uuid) from public;
grant execute on function public.role_of(uuid) to authenticated, anon;
