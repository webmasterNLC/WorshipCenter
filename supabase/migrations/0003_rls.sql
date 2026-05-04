-- 0003_rls.sql — Row Level Security for tables used in Plan A.

-- profiles
alter table profiles enable row level security;

create policy "profiles: read own + admin reads all" on profiles for select
  using (
    id = auth.uid() or auth.role_of(auth.uid()) = 'admin'
  );

create policy "profiles: admin updates roles" on profiles for update
  using (auth.role_of(auth.uid()) = 'admin')
  with check (auth.role_of(auth.uid()) = 'admin');

create policy "profiles: self updates own profile (not role)" on profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles p where p.id = auth.uid())
  );

-- profile inserts happen via service-role from invite-accept handler; deny client inserts.
create policy "profiles: no client inserts" on profiles for insert with check (false);

-- invitations: admin only
alter table invitations enable row level security;

create policy "invitations: admin only" on invitations for all
  using (auth.role_of(auth.uid()) = 'admin')
  with check (auth.role_of(auth.uid()) = 'admin');

-- audit_log: admin reads, service-role writes
alter table audit_log enable row level security;

create policy "audit_log: admin reads" on audit_log for select
  using (auth.role_of(auth.uid()) = 'admin');

-- auth_attempts: service-role only (used by rate limit checks)
alter table auth_attempts enable row level security;
-- No policies = no client access. Service role bypasses RLS by design.
