-- 0017_role_of_security_definer_fix.sql
-- Restore role_of() to SECURITY DEFINER.
--
-- Migration 0015 changed role_of from DEFINER to INVOKER on the
-- assumption that the JWT app_metadata.role claim would always satisfy
-- the self-lookup (zero DB hop). In practice, any session whose token
-- was issued BEFORE the auth hook was wired (or before 0016 fixed it)
-- carries no role claim. role_of then falls back to the DB read:
--
--   (select role from public.profiles where id = uid)
--
-- That SELECT re-enters the profiles RLS evaluator, which calls
-- role_of(...), which falls back to the DB read again, and so on.
-- Postgres detects the cycle and aborts every UPDATE/INSERT/SELECT on
-- profiles with:
--
--   ERROR: infinite recursion detected in policy for relation "profiles"
--
-- SECURITY DEFINER makes role_of run with the function owner's
-- (postgres) privileges, bypassing RLS on its internal SELECT. No
-- recursion possible. Same canonical pattern Supabase docs recommend
-- for any helper that's invoked from inside an RLS policy. The
-- security advisors will re-surface the "anon/authenticated can
-- execute SECURITY DEFINER" warnings — they are by design here.

create or replace function public.role_of(uid uuid) returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when uid = (select auth.uid()) then
      coalesce(
        nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')::public.user_role,
        (select role from public.profiles where id = uid)
      )
    else
      (select role from public.profiles where id = uid)
  end;
$$;

revoke all on function public.role_of(uuid) from public;
grant execute on function public.role_of(uuid) to authenticated, anon;
