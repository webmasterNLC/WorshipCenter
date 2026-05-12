-- 0018_profiles_role_immutability_trigger.sql
-- Resolves the persistent "infinite recursion detected in policy for
-- relation profiles" that 0017 alone did not fix.
--
-- 0014's UPDATE WITH CHECK contained a raw (SELECT role FROM profiles
-- WHERE id = auth.uid()) subquery to enforce "self can't change role".
-- Postgres flags any RLS policy that references its own table via a
-- raw SELECT as recursive, even when role_of() is SECURITY DEFINER —
-- the syntactic self-reference is enough.
--
-- Fix: remove the role-immutability check from RLS entirely. RLS now
-- decides only WHO can update a profile row. Enforcement of WHICH
-- columns a non-admin may touch is moved into a BEFORE UPDATE trigger,
-- which runs as SECURITY DEFINER and reads role_of() cleanly.

drop policy if exists "profiles: admin or self updates" on profiles;

create policy "profiles: admin or self updates" on profiles for update
  using (
    public.role_of((select auth.uid())) = 'admin'
    or id = (select auth.uid())
  )
  with check (
    public.role_of((select auth.uid())) = 'admin'
    or id = (select auth.uid())
  );

create or replace function public.enforce_role_immutability_for_non_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and public.role_of((select auth.uid())) <> 'admin' then
    raise exception 'Only admins can change a user role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_role_immutability on profiles;
create trigger profiles_enforce_role_immutability
  before update on profiles
  for each row execute function public.enforce_role_immutability_for_non_admin();
