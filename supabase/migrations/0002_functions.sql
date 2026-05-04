-- 0002_functions.sql — Helper functions used by RLS and audit log writes.

-- SECURITY DEFINER lets RLS policies on other tables read profiles.role
-- without recursing through profiles' own policies. The function body is
-- a trivial SELECT, no logic, no SQL injection surface.
create or replace function auth.role_of(uid uuid) returns user_role
  language sql stable security definer
  set search_path = public
  as $$ select role from public.profiles where id = uid $$;

revoke all on function auth.role_of(uuid) from public;
grant execute on function auth.role_of(uuid) to authenticated, anon;

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
-- Only the service role uses this; do not grant to authenticated.
