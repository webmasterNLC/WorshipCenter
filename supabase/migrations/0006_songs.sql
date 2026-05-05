-- 0006_songs.sql — songs table for Plan B.

create table songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  language text not null check (language in ('de','en','ta')),
  original_key text not null check (original_key ~ '^[A-G](#|b)?m?$'),
  bpm int check (bpm between 30 and 300),
  time_signature text check (time_signature ~ '^\d+/\d+$'),
  body_chordpro text not null,
  notes text,
  tags text[] not null default '{}',
  created_by uuid not null references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_tags_gin on songs using gin (tags);
create index songs_title_tsv on songs using gin (to_tsvector('simple', title));
create index songs_language_idx on songs (language);

create or replace function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = public
  as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger songs_updated_at
  before update on songs
  for each row execute function public.set_updated_at();
