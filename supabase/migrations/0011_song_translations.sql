-- 0011_song_translations.sql — multilingual songs.
--
-- A song can have one or more translations. Each translation owns its own
-- title and chordpro body for a specific language. Exactly one translation
-- per song is the "primary" — its values are mirrored into the existing
-- songs.title / songs.language / songs.body_chordpro columns via trigger,
-- so list / sort / search queries stay single-table without a JOIN.
--
-- Existing rows in songs are backfilled into one primary translation each.
-- No columns on songs are dropped here; they remain as the cache.

create table song_translations (
  id            uuid primary key default gen_random_uuid(),
  song_id       uuid not null references songs(id) on delete cascade,
  language      text not null check (language in ('de','en','ta')),
  title         text not null,
  body_chordpro text not null,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (song_id, language)
);

-- At most one primary per song; application is responsible for ensuring
-- at least one (every song has one, by construction).
create unique index song_translations_one_primary_idx
  on song_translations (song_id) where is_primary;

create index song_translations_song_idx on song_translations (song_id);
create index song_translations_lang_idx on song_translations (language);

-- Refresh updated_at on row changes — reuses the existing helper that pins
-- search_path (defined in 0006_songs.sql).
create trigger song_translations_updated_at
  before update on song_translations
  for each row execute function public.set_updated_at();

-- When a primary translation is inserted or updated, mirror its values
-- into the songs cache so listSongs() / sort / search keep working.
create or replace function public.sync_primary_translation_to_song()
  returns trigger
  language plpgsql
  security invoker
  set search_path = public
  as $$
begin
  if new.is_primary then
    update songs
      set title         = new.title,
          language      = new.language,
          body_chordpro = new.body_chordpro
      where id = new.song_id;
  end if;
  return new;
end;
$$;

-- Don't expose this helper via REST.
revoke all on function public.sync_primary_translation_to_song() from public;

create trigger song_translations_sync_primary
  after insert or update on song_translations
  for each row execute function public.sync_primary_translation_to_song();

-- Backfill: every existing song gets a single primary translation copied
-- from its current title/language/body_chordpro. The sync trigger fires but
-- writes the same values, so it's idempotent.
insert into song_translations (song_id, language, title, body_chordpro, is_primary)
select id, language, title, body_chordpro, true
from songs;

alter table song_translations enable row level security;

create policy "song_translations: any band member reads"
  on song_translations for select
  using (public.role_of(auth.uid()) in ('admin','leader','musician'));

create policy "song_translations: admin writes"
  on song_translations for all
  using (public.role_of(auth.uid()) = 'admin')
  with check (public.role_of(auth.uid()) = 'admin');
