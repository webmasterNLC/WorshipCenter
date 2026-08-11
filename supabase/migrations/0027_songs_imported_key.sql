-- 0027_songs_imported_key.sql — remember the key a chart arrived in.
--
-- Charts from pnwchords come in whatever key the source site published. The
-- band plays a fixed key per song ("The Blessing" is ours in C), and the app
-- treats transpose_semitones = 0 as "as stored", so the stored chart itself
-- has to be in the band's key for 0 to mean the right thing.
--
-- Rewriting the body loses which key it came in, and that is worth keeping:
-- musicians compare against the original recording, and it is the only way to
-- tell a deliberate rebase from a mis-detected import. (songs.original_key is
-- not that record — it tracks the key the *stored* body is in, and moves with
-- every rebase.)
--
-- Nullable: null means "never rebased, original_key is still what came in".
-- Backfill is deliberately omitted — for existing rows we genuinely do not
-- know whether original_key was ever correct, and inventing a value would be
-- worse than admitting the gap.

alter table songs
  add column imported_key text
    check (imported_key ~ '^[A-G](#|b)?m?$');

comment on column songs.imported_key is
  'Key the chart was in when first imported, before any rebase. Null = never rebased.';
