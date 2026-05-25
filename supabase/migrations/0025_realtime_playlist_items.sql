-- Enable Postgres Changes (Realtime) for playlist_items so live-sync in
-- the stage viewer picks up the lead's edits (transpose, performance
-- notes, item add/remove) within ~1s on every connected iPad.
--
-- RLS still applies on the client subscription: only users with SELECT
-- on playlist_items will receive events.
alter publication supabase_realtime add table public.playlist_items;
