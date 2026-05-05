-- 0007_songs_rls.sql — RLS for songs.

alter table songs enable row level security;

create policy "songs: any band member reads" on songs for select
  using (public.role_of(auth.uid()) in ('admin','leader','musician'));

create policy "songs: admin writes" on songs for all
  using (public.role_of(auth.uid()) = 'admin')
  with check (public.role_of(auth.uid()) = 'admin');
