-- 0020_programs_name_optional_admin_only_create.sql
-- "Setlist" → "Program" relabel — DB names unchanged, but the
-- semantics tighten to match the new UI/permission model:
--
-- * Program (playlists table): admin only creates / updates / deletes.
--   `name` is now optional — programs are identified by date in the UI.
-- * Service rota (service_assignments): admin only writes (was
--   owner-or-admin).
-- * Songs inside a program (playlist_items + playlist_versions):
--   admin + leader write (was owner-or-admin).
-- * Read access is unchanged: any signed-in band member sees the program.

alter table playlists alter column name drop not null;

drop policy if exists "playlists: leader|admin creates" on playlists;
drop policy if exists "playlists: owner|admin updates"  on playlists;
drop policy if exists "playlists: owner|admin deletes"  on playlists;

create policy "playlists: admin creates" on playlists for insert
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "playlists: admin updates" on playlists for update
  using (public.role_of((select auth.uid())) = 'admin')
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "playlists: admin deletes" on playlists for delete
  using (public.role_of((select auth.uid())) = 'admin');

drop policy if exists "playlist_items: insert if owner|admin" on playlist_items;
drop policy if exists "playlist_items: update if owner|admin" on playlist_items;
drop policy if exists "playlist_items: delete if owner|admin" on playlist_items;

create policy "playlist_items: admin or leader inserts" on playlist_items for insert
  with check (public.role_of((select auth.uid())) in ('admin','leader'));
create policy "playlist_items: admin or leader updates" on playlist_items for update
  using (public.role_of((select auth.uid())) in ('admin','leader'))
  with check (public.role_of((select auth.uid())) in ('admin','leader'));
create policy "playlist_items: admin or leader deletes" on playlist_items for delete
  using (public.role_of((select auth.uid())) in ('admin','leader'));

drop policy if exists "playlist_versions: insert if owner|admin" on playlist_versions;
drop policy if exists "playlist_versions: update if owner|admin" on playlist_versions;
drop policy if exists "playlist_versions: delete if owner|admin" on playlist_versions;

create policy "playlist_versions: admin or leader inserts" on playlist_versions for insert
  with check (public.role_of((select auth.uid())) in ('admin','leader'));
create policy "playlist_versions: admin or leader updates" on playlist_versions for update
  using (public.role_of((select auth.uid())) in ('admin','leader'))
  with check (public.role_of((select auth.uid())) in ('admin','leader'));
create policy "playlist_versions: admin or leader deletes" on playlist_versions for delete
  using (public.role_of((select auth.uid())) in ('admin','leader'));

drop policy if exists "service_assignments: owner or admin inserts" on service_assignments;
drop policy if exists "service_assignments: owner or admin updates" on service_assignments;
drop policy if exists "service_assignments: owner or admin deletes" on service_assignments;

create policy "service_assignments: admin inserts" on service_assignments for insert
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "service_assignments: admin updates" on service_assignments for update
  using (public.role_of((select auth.uid())) = 'admin')
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "service_assignments: admin deletes" on service_assignments for delete
  using (public.role_of((select auth.uid())) = 'admin');
