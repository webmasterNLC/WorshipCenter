-- 0002_functions.sql — Helper functions used by RLS and audit log writes.
--
-- NOTE: role_of lives in `public` (not `auth`) because hosted Supabase locks
-- the `auth` schema to its own service. SECURITY DEFINER + a tight grant list
-- gives the same isolation: anon and authenticated roles can call it, but the
-- function body still runs with the owner's rights so RLS on profiles doesn't
-- recurse.

create or replace function public.role_of(uid uuid) returns user_role
  language sql stable security definer
  set search_path = public
  as $$ select role from public.profiles where id = uid $$;

revoke all on function public.role_of(uuid) from public;
grant execute on function public.role_of(uuid) to authenticated, anon;

-- Helper: write an audit row from a server action via the service role.
-- Server actions call this with the actor uuid; it does not trust auth.uid().
create or replace function public.write_audit(
  p_actor uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb default '{}'::jsonb
) returns void
  language plpgsql security definer
  set search_path = public
  as $$
begin
  insert into audit_log (actor_id, action, target_type, target_id, metadata)
  values (p_actor, p_action, p_target_type, p_target_id, p_metadata);
end;
$$;

revoke all on function public.write_audit(uuid, text, text, text, jsonb) from public;
-- Supabase auto-grants EXECUTE on public-schema functions to anon + authenticated;
-- revoke explicitly so only the service role (which bypasses grants) can call this.
-- Without this, /rest/v1/rpc/write_audit would let any signed-in (or anon!) user
-- forge audit rows attributed to arbitrary actors.
revoke execute on function public.write_audit(uuid, text, text, text, jsonb) from anon, authenticated;
