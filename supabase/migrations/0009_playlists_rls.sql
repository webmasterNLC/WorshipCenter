-- 0009_playlists_rls.sql — RLS for playlists, items, versions.

alter table playlists enable row level security;

create policy "playlists: any band member reads" on playlists for select
  using (public.role_of(auth.uid()) in ('admin','leader','musician'));

create policy "playlists: leader|admin creates" on playlists for insert
  with check (
    public.role_of(auth.uid()) in ('leader','admin')
    and owner_id = auth.uid()
  );

create policy "playlists: owner|admin updates" on playlists for update
  using (owner_id = auth.uid() or public.role_of(auth.uid()) = 'admin')
  with check (owner_id = auth.uid() or public.role_of(auth.uid()) = 'admin');

create policy "playlists: owner|admin deletes" on playlists for delete
  using (owner_id = auth.uid() or public.role_of(auth.uid()) = 'admin');

alter table playlist_items enable row level security;

create policy "playlist_items: read if band member" on playlist_items for select
  using (
    public.role_of(auth.uid()) in ('admin','leader','musician')
    and exists (select 1 from playlists p where p.id = playlist_id)
  );

create policy "playlist_items: write if owner|admin" on playlist_items for all
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = auth.uid() or public.role_of(auth.uid()) = 'admin')
    )
  )
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = auth.uid() or public.role_of(auth.uid()) = 'admin')
    )
  );

alter table playlist_versions enable row level security;

create policy "playlist_versions: read if band member" on playlist_versions for select
  using (
    public.role_of(auth.uid()) in ('admin','leader','musician')
    and exists (select 1 from playlists p where p.id = playlist_id)
  );

create policy "playlist_versions: write if owner|admin" on playlist_versions for all
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = auth.uid() or public.role_of(auth.uid()) = 'admin')
    )
  )
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id
        and (p.owner_id = auth.uid() or public.role_of(auth.uid()) = 'admin')
    )
  );
