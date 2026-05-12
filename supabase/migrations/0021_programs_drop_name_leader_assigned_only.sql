-- 0021_programs_drop_name_leader_assigned_only.sql
-- Two refinements on top of 0020:
--
-- (a) Drop playlists.name entirely. Programs are identified by their
--     scheduled_for date in the UI; a free-text name added nothing.
--
-- (b) Tighten the playlist_items / playlist_versions write policies so
--     that leaders can edit a program ONLY if admin has assigned them
--     to that program's service rota. Existing policy granted any
--     leader edit rights on any program — too permissive.

alter table playlists drop column name;

drop policy if exists "playlist_items: admin or leader inserts" on playlist_items;
drop policy if exists "playlist_items: admin or leader updates" on playlist_items;
drop policy if exists "playlist_items: admin or leader deletes" on playlist_items;

create policy "playlist_items: admin or assigned leader inserts" on playlist_items for insert
  with check (
    public.role_of((select auth.uid())) = 'admin'
    or (
      public.role_of((select auth.uid())) = 'leader'
      and exists (
        select 1 from service_assignments sa
        where sa.playlist_id = playlist_items.playlist_id
          and sa.member_id = (select auth.uid())
      )
    )
  );

create policy "playlist_items: admin or assigned leader updates" on playlist_items for update
  using (
    public.role_of((select auth.uid())) = 'admin'
    or (
      public.role_of((select auth.uid())) = 'leader'
      and exists (
        select 1 from service_assignments sa
        where sa.playlist_id = playlist_items.playlist_id
          and sa.member_id = (select auth.uid())
      )
    )
  )
  with check (
    public.role_of((select auth.uid())) = 'admin'
    or (
      public.role_of((select auth.uid())) = 'leader'
      and exists (
        select 1 from service_assignments sa
        where sa.playlist_id = playlist_items.playlist_id
          and sa.member_id = (select auth.uid())
      )
    )
  );

create policy "playlist_items: admin or assigned leader deletes" on playlist_items for delete
  using (
    public.role_of((select auth.uid())) = 'admin'
    or (
      public.role_of((select auth.uid())) = 'leader'
      and exists (
        select 1 from service_assignments sa
        where sa.playlist_id = playlist_items.playlist_id
          and sa.member_id = (select auth.uid())
      )
    )
  );

drop policy if exists "playlist_versions: admin or leader inserts" on playlist_versions;
drop policy if exists "playlist_versions: admin or leader updates" on playlist_versions;
drop policy if exists "playlist_versions: admin or leader deletes" on playlist_versions;

create policy "playlist_versions: admin or assigned leader inserts" on playlist_versions for insert
  with check (
    public.role_of((select auth.uid())) = 'admin'
    or (
      public.role_of((select auth.uid())) = 'leader'
      and exists (
        select 1 from service_assignments sa
        where sa.playlist_id = playlist_versions.playlist_id
          and sa.member_id = (select auth.uid())
      )
    )
  );

create policy "playlist_versions: admin or assigned leader updates" on playlist_versions for update
  using (
    public.role_of((select auth.uid())) = 'admin'
    or (
      public.role_of((select auth.uid())) = 'leader'
      and exists (
        select 1 from service_assignments sa
        where sa.playlist_id = playlist_versions.playlist_id
          and sa.member_id = (select auth.uid())
      )
    )
  )
  with check (
    public.role_of((select auth.uid())) = 'admin'
    or (
      public.role_of((select auth.uid())) = 'leader'
      and exists (
        select 1 from service_assignments sa
        where sa.playlist_id = playlist_versions.playlist_id
          and sa.member_id = (select auth.uid())
      )
    )
  );

create policy "playlist_versions: admin or assigned leader deletes" on playlist_versions for delete
  using (
    public.role_of((select auth.uid())) = 'admin'
    or (
      public.role_of((select auth.uid())) = 'leader'
      and exists (
        select 1 from service_assignments sa
        where sa.playlist_id = playlist_versions.playlist_id
          and sa.member_id = (select auth.uid())
      )
    )
  );
