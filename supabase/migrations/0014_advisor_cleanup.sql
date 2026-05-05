-- 0014_advisor_cleanup.sql — performance advisor remediation.
-- Three classes of fixes, all behavior-preserving:
--
-- 1. auth_rls_initplan: replace auth.uid() with (select auth.uid()) in
--    every policy. Postgres caches the inner-select result once per query
--    instead of re-evaluating per row.
--
-- 2. multiple_permissive_policies: tables that had a "FOR SELECT band reads"
--    policy AND a "FOR ALL admin writes" policy were forced to evaluate
--    BOTH on every SELECT. Split each FOR ALL into separate FOR INSERT /
--    FOR UPDATE / FOR DELETE policies so the SELECT slot is owned by one.
--
-- 3. unindexed_foreign_keys: add covering indexes on FK columns that are
--    used in JOINs and ON DELETE checks.

------------------------------------------------------------------------
-- profiles
------------------------------------------------------------------------
drop policy if exists "profiles: read own + admin reads all" on profiles;
drop policy if exists "profiles: admin updates roles"        on profiles;
drop policy if exists "profiles: self updates own profile (not role)" on profiles;

create policy "profiles: read own + admin reads all" on profiles for select
  using (
    id = (select auth.uid())
    or public.role_of((select auth.uid())) = 'admin'
  );

-- Merge the two UPDATE policies into one — admin can update anything,
-- self can update own row but role must stay the same. Avoids the
-- multiple_permissive_policies on profiles UPDATE.
create policy "profiles: admin or self updates" on profiles for update
  using (
    public.role_of((select auth.uid())) = 'admin'
    or id = (select auth.uid())
  )
  with check (
    public.role_of((select auth.uid())) = 'admin'
    or (
      id = (select auth.uid())
      and role = (select role from public.profiles p where p.id = (select auth.uid()))
    )
  );

-- "no client inserts" stays — no auth.uid() inside, no rewrite needed.

------------------------------------------------------------------------
-- invitations
------------------------------------------------------------------------
drop policy if exists "invitations: admin only" on invitations;

create policy "invitations: admin reads"   on invitations for select
  using (public.role_of((select auth.uid())) = 'admin');
create policy "invitations: admin inserts" on invitations for insert
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "invitations: admin updates" on invitations for update
  using (public.role_of((select auth.uid())) = 'admin')
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "invitations: admin deletes" on invitations for delete
  using (public.role_of((select auth.uid())) = 'admin');

------------------------------------------------------------------------
-- audit_log
------------------------------------------------------------------------
drop policy if exists "audit_log: admin reads" on audit_log;

create policy "audit_log: admin reads" on audit_log for select
  using (public.role_of((select auth.uid())) = 'admin');

------------------------------------------------------------------------
-- songs
------------------------------------------------------------------------
drop policy if exists "songs: any band member reads" on songs;
drop policy if exists "songs: admin writes"          on songs;

create policy "songs: any band member reads" on songs for select
  using (public.role_of((select auth.uid())) in ('admin','leader','viewer'));

create policy "songs: admin inserts" on songs for insert
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "songs: admin updates" on songs for update
  using (public.role_of((select auth.uid())) = 'admin')
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "songs: admin deletes" on songs for delete
  using (public.role_of((select auth.uid())) = 'admin');

------------------------------------------------------------------------
-- playlists (4 separate policies — already not FOR ALL, just rewrap)
------------------------------------------------------------------------
drop policy if exists "playlists: any band member reads" on playlists;
drop policy if exists "playlists: leader|admin creates"  on playlists;
drop policy if exists "playlists: owner|admin updates"   on playlists;
drop policy if exists "playlists: owner|admin deletes"   on playlists;

create policy "playlists: any band member reads" on playlists for select
  using (public.role_of((select auth.uid())) in ('admin','leader','viewer'));

create policy "playlists: leader|admin creates" on playlists for insert
  with check (
    public.role_of((select auth.uid())) in ('leader','admin')
    and owner_id = (select auth.uid())
  );

create policy "playlists: owner|admin updates" on playlists for update
  using (owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin')
  with check (owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin');

create policy "playlists: owner|admin deletes" on playlists for delete
  using (owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin');

------------------------------------------------------------------------
-- playlist_items
------------------------------------------------------------------------
drop policy if exists "playlist_items: read if band member"  on playlist_items;
drop policy if exists "playlist_items: write if owner|admin" on playlist_items;

create policy "playlist_items: read if band member" on playlist_items for select
  using (
    public.role_of((select auth.uid())) in ('admin','leader','viewer')
    and exists (select 1 from playlists p where p.id = playlist_id)
  );

create policy "playlist_items: insert if owner|admin" on playlist_items for insert
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin')
    )
  );
create policy "playlist_items: update if owner|admin" on playlist_items for update
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin')
    )
  )
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin')
    )
  );
create policy "playlist_items: delete if owner|admin" on playlist_items for delete
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin')
    )
  );

------------------------------------------------------------------------
-- playlist_versions
------------------------------------------------------------------------
drop policy if exists "playlist_versions: read if band member"  on playlist_versions;
drop policy if exists "playlist_versions: write if owner|admin" on playlist_versions;

create policy "playlist_versions: read if band member" on playlist_versions for select
  using (
    public.role_of((select auth.uid())) in ('admin','leader','viewer')
    and exists (select 1 from playlists p where p.id = playlist_id)
  );

create policy "playlist_versions: insert if owner|admin" on playlist_versions for insert
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin')
    )
  );
create policy "playlist_versions: update if owner|admin" on playlist_versions for update
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin')
    )
  )
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin')
    )
  );
create policy "playlist_versions: delete if owner|admin" on playlist_versions for delete
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = (select auth.uid()) or public.role_of((select auth.uid())) = 'admin')
    )
  );

------------------------------------------------------------------------
-- profile_capabilities
------------------------------------------------------------------------
drop policy if exists "profile_capabilities: any band member reads" on profile_capabilities;
drop policy if exists "profile_capabilities: admin writes"          on profile_capabilities;

create policy "profile_capabilities: any band member reads"
  on profile_capabilities for select
  using (public.role_of((select auth.uid())) in ('admin','leader','viewer'));

create policy "profile_capabilities: admin inserts" on profile_capabilities for insert
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "profile_capabilities: admin updates" on profile_capabilities for update
  using (public.role_of((select auth.uid())) = 'admin')
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "profile_capabilities: admin deletes" on profile_capabilities for delete
  using (public.role_of((select auth.uid())) = 'admin');

------------------------------------------------------------------------
-- song_translations
------------------------------------------------------------------------
drop policy if exists "song_translations: any band member reads" on song_translations;
drop policy if exists "song_translations: admin writes"          on song_translations;

create policy "song_translations: any band member reads"
  on song_translations for select
  using (public.role_of((select auth.uid())) in ('admin','leader','viewer'));

create policy "song_translations: admin inserts" on song_translations for insert
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "song_translations: admin updates" on song_translations for update
  using (public.role_of((select auth.uid())) = 'admin')
  with check (public.role_of((select auth.uid())) = 'admin');
create policy "song_translations: admin deletes" on song_translations for delete
  using (public.role_of((select auth.uid())) = 'admin');

------------------------------------------------------------------------
-- service_assignments
------------------------------------------------------------------------
drop policy if exists "service_assignments: any band member reads" on service_assignments;
drop policy if exists "service_assignments: owner or admin writes" on service_assignments;

create policy "service_assignments: any band member reads"
  on service_assignments for select
  using (public.role_of((select auth.uid())) in ('admin','leader','viewer'));

create policy "service_assignments: owner or admin inserts"
  on service_assignments for insert
  with check (
    public.role_of((select auth.uid())) = 'admin'
    or exists (
      select 1 from playlists p
      where p.id = playlist_id and p.owner_id = (select auth.uid())
    )
  );
create policy "service_assignments: owner or admin updates"
  on service_assignments for update
  using (
    public.role_of((select auth.uid())) = 'admin'
    or exists (
      select 1 from playlists p
      where p.id = playlist_id and p.owner_id = (select auth.uid())
    )
  )
  with check (
    public.role_of((select auth.uid())) = 'admin'
    or exists (
      select 1 from playlists p
      where p.id = playlist_id and p.owner_id = (select auth.uid())
    )
  );
create policy "service_assignments: owner or admin deletes"
  on service_assignments for delete
  using (
    public.role_of((select auth.uid())) = 'admin'
    or exists (
      select 1 from playlists p
      where p.id = playlist_id and p.owner_id = (select auth.uid())
    )
  );

------------------------------------------------------------------------
-- Indexes for unindexed foreign keys
------------------------------------------------------------------------
create index if not exists audit_log_actor_id_idx          on audit_log (actor_id);
create index if not exists invitations_invited_by_idx      on invitations (invited_by);
create index if not exists playlist_items_song_id_idx      on playlist_items (song_id);
create index if not exists playlist_versions_saved_by_idx  on playlist_versions (saved_by);
create index if not exists service_assignments_assigned_by_idx on service_assignments (assigned_by);
create index if not exists songs_created_by_idx            on songs (created_by);
create index if not exists songs_updated_by_idx            on songs (updated_by);
