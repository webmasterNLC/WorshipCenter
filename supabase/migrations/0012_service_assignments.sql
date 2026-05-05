-- 0012_service_assignments.sql — rota / Dienstplan per playlist.
--
-- A playlist represents a Sunday service. Each service has a rota: who's
-- on worship lead, vocals, drums, etc. Members are assigned by the
-- playlist's owner (or an admin). Capabilities (0010_profile_capabilities)
-- gate WHO can be assigned to a role; the picker uses them to filter
-- candidates, and assignToService double-checks at the boundary.
--
-- Maxes per role are intentionally NOT enforced at the DB layer — leaders
-- decide how many vocals or worship leads a given Sunday needs.

create table service_assignments (
  id            uuid primary key default gen_random_uuid(),
  playlist_id   uuid not null references playlists(id) on delete cascade,
  role          text not null check (role in (
                  'worship_lead','vocal','drums','bass','guitar','keys',
                  'sound','camera','projector'
                )),
  member_id     uuid not null references profiles(id) on delete restrict,
  notes         text,
  assigned_by   uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  unique (playlist_id, role, member_id)
);

create index service_assignments_playlist_idx on service_assignments (playlist_id);
create index service_assignments_member_idx   on service_assignments (member_id);

alter table service_assignments enable row level security;

-- Any band member reads — they need to see who's on duty Sunday.
create policy "service_assignments: any band member reads"
  on service_assignments for select
  using (public.role_of(auth.uid()) in ('admin','leader','musician'));

-- Write: only the playlist's owner OR an admin (mirrors the playlist UPDATE
-- policy in 0009_playlists_rls.sql for consistency).
create policy "service_assignments: owner or admin writes"
  on service_assignments for all
  using (
    public.role_of(auth.uid()) = 'admin'
    or exists (
      select 1 from playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
  )
  with check (
    public.role_of(auth.uid()) = 'admin'
    or exists (
      select 1 from playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
  );
