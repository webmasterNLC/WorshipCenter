-- 0013_rename_musician_to_viewer.sql
-- Rename the user_role enum value 'musician' → 'viewer'.
--
-- 'musician' was misleading because non-musical roles (sound, camera,
-- projector) also had it. 'viewer' captures the base read/contribute
-- permission level; what someone actually plays is encoded in
-- profile_capabilities, not in their role.
--
-- ALTER TYPE … RENAME VALUE updates the enum in-place; existing rows
-- automatically reflect the new name. We must:
--   1. Drop the column default that references the old name
--   2. Rename the enum value
--   3. Re-set the default with the new name
--   4. Recreate every RLS policy that hard-codes 'musician' as a string
--      literal (PostgreSQL would otherwise fail to cast the now-invalid
--      'musician' to user_role at policy evaluation time).

-- 1. Drop default that references 'musician'
alter table profiles alter column role drop default;

-- 2. Rename
alter type user_role rename value 'musician' to 'viewer';

-- 3. Re-add default with new name
alter table profiles alter column role set default 'viewer'::user_role;

-- 4. Recreate RLS policies that string-compare against 'musician'.
-- songs (was 0007)
drop policy if exists "songs: any band member reads" on songs;
create policy "songs: any band member reads" on songs for select
  using (public.role_of(auth.uid()) in ('admin','leader','viewer'));

-- playlists (was 0009)
drop policy if exists "playlists: any band member reads" on playlists;
create policy "playlists: any band member reads" on playlists for select
  using (public.role_of(auth.uid()) in ('admin','leader','viewer'));

drop policy if exists "playlist_items: read if band member" on playlist_items;
create policy "playlist_items: read if band member" on playlist_items for select
  using (
    public.role_of(auth.uid()) in ('admin','leader','viewer')
    and exists (select 1 from playlists p where p.id = playlist_id)
  );

drop policy if exists "playlist_versions: read if band member" on playlist_versions;
create policy "playlist_versions: read if band member" on playlist_versions for select
  using (
    public.role_of(auth.uid()) in ('admin','leader','viewer')
    and exists (select 1 from playlists p where p.id = playlist_id)
  );

-- profile_capabilities (was 0010)
drop policy if exists "profile_capabilities: any band member reads" on profile_capabilities;
create policy "profile_capabilities: any band member reads"
  on profile_capabilities for select
  using (public.role_of(auth.uid()) in ('admin','leader','viewer'));

-- song_translations (was 0011)
drop policy if exists "song_translations: any band member reads" on song_translations;
create policy "song_translations: any band member reads"
  on song_translations for select
  using (public.role_of(auth.uid()) in ('admin','leader','viewer'));

-- service_assignments (was 0012)
drop policy if exists "service_assignments: any band member reads" on service_assignments;
create policy "service_assignments: any band member reads"
  on service_assignments for select
  using (public.role_of(auth.uid()) in ('admin','leader','viewer'));
