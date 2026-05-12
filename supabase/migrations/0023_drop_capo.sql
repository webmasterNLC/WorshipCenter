-- 0023_drop_capo.sql
-- Capo control removed from the UI. Transpose alone is enough for tone
-- adjustments on the worship-band stage. Drop the column.

alter table playlist_items drop column capo;
