-- auth_attempts was service-role-only (no policies at all), which meant the
-- sign-in log could not be surfaced in /admin/audit without handing the page a
-- service-role client. Grant admins SELECT instead, matching how audit_log is
-- read. Writes stay service-role-only: still no insert/update/delete policy, so
-- nobody can forge or erase a sign-in record.
create policy "auth_attempts: admin reads" on auth_attempts for select
  using (public.role_of((select auth.uid())) = 'admin');
