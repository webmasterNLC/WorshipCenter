-- 0026_profiles_soft_delete.sql — soft-delete column for profiles.
--
-- Hard-delete of auth.users / profiles is blocked by FK constraints from
-- audit_log, service_assignments (on delete restrict), playlists owner_id,
-- and others. Soft-delete is the way out: set disabled_at and the user
-- disappears from the admin list and rota picker.
--
-- Companion behavior (in application code, not SQL):
--   * Supabase auth.users.banned_until is set via the admin API.
--   * Future service_assignments are deleted on deactivation.
--
-- The partial index keeps the hot path (active members) fast; deactivated
-- rows are rare and don't need to be indexed in the same shape.

alter table profiles
  add column disabled_at timestamptz;

create index profiles_active_idx on profiles (created_at desc)
  where disabled_at is null;
