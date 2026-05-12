-- 0024_playlist_items_song_cascade_delete.sql
-- Was ON DELETE RESTRICT, which blocked any song delete the moment the
-- song appeared in any program's setlist. The admin's "Danger zone /
-- Delete song" button now matches its label — deleting a song removes
-- it from every program it was in.

alter table playlist_items
  drop constraint playlist_items_song_id_fkey;

alter table playlist_items
  add constraint playlist_items_song_id_fkey
  foreign key (song_id) references songs(id) on delete cascade;
