-- 0008_playlists.sql — playlists tables for Plan C.

create table playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scheduled_for date,
  description text,
  owner_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index playlists_owner_idx on playlists (owner_id);
create index playlists_scheduled_idx on playlists (scheduled_for);

create trigger playlists_updated_at
  before update on playlists
  for each row execute function public.set_updated_at();

create table playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  song_id uuid not null references songs(id) on delete restrict,
  position int not null,
  transpose_semitones int not null default 0 check (transpose_semitones between -12 and 12),
  capo int check (capo between 0 and 11),
  performance_notes text,
  unique (playlist_id, position)
);
create index playlist_items_playlist_idx on playlist_items (playlist_id);

create table playlist_versions (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  saved_by uuid not null references profiles(id),
  saved_at timestamptz not null default now(),
  unique (playlist_id, version)
);
create index playlist_versions_playlist_idx on playlist_versions (playlist_id);
