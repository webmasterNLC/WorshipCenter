import { notFound } from 'next/navigation';
import {
  getPlaylist,
  updatePlaylist,
  addSongToPlaylist,
  removePlaylistItem,
  updatePlaylistItem,
  reorderPlaylistItems,
  savePlaylistVersion,
} from '@/server/actions/playlists';
import { listSongs } from '@/server/actions/songs';
import { requireOwnerOrAdmin } from '@/server/auth/require';
import { PlaylistEditorClient } from '@/components/playlists/PlaylistEditorClient';
import type { PlaylistItemData, SongPickerItem } from '@/components/playlists/PlaylistEditorClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaylistEditPage({ params }: PageProps) {
  const { id } = await params;
  await requireOwnerOrAdmin(id);

  const [playlist, songs] = await Promise.all([getPlaylist(id), listSongs()]);
  if (!playlist) notFound();

  // -------------------------------------------------------------------------
  // Inline server actions — these are passed as props to the client component.
  // Each has its own 'use server' directive (file-level is avoided for
  // Turbopack compatibility).
  // -------------------------------------------------------------------------

  async function saveMeta(name: string, scheduledFor: string, description: string) {
    'use server';
    await updatePlaylist(id, {
      name,
      scheduled_for: scheduledFor || undefined,
      description: description || undefined,
    });
  }

  async function addSong(songId: string) {
    'use server';
    await addSongToPlaylist({ playlist_id: id, song_id: songId, transpose_semitones: 0 });
  }

  async function removeItem(itemId: string) {
    'use server';
    await removePlaylistItem(itemId);
  }

  async function updateTranspose(itemId: string, semitones: number) {
    'use server';
    await updatePlaylistItem({ id: itemId, transpose_semitones: semitones });
  }

  async function updateCapo(itemId: string, capo: number | null) {
    'use server';
    await updatePlaylistItem({ id: itemId, capo });
  }

  async function updateNotes(itemId: string, notes: string | null) {
    'use server';
    await updatePlaylistItem({ id: itemId, performance_notes: notes });
  }

  async function reorder(orderedIds: string[]) {
    'use server';
    await reorderPlaylistItems({ playlist_id: id, ordered_item_ids: orderedIds });
  }

  async function saveVersion() {
    'use server';
    await savePlaylistVersion(id);
  }

  // Map to plain serialisable shapes for the client component
  const initialItems: PlaylistItemData[] = playlist.items.map((item) => ({
    id: item.id,
    song_id: item.song_id,
    position: item.position,
    transpose_semitones: item.transpose_semitones,
    capo: item.capo,
    performance_notes: item.performance_notes,
    song: item.song
      ? {
          id: item.song.id,
          title: item.song.title,
          language: item.song.language,
          original_key: item.song.original_key,
          bpm: item.song.bpm,
        }
      : null,
  }));

  const allSongs: SongPickerItem[] = songs.map((s) => ({
    id: s.id,
    title: s.title,
    language: s.language,
    original_key: s.original_key,
    bpm: s.bpm ?? null,
  }));

  return (
    <PlaylistEditorClient
      playlistId={id}
      initialName={playlist.name}
      initialDate={playlist.scheduled_for ?? ''}
      initialDesc={playlist.description ?? ''}
      initialItems={initialItems}
      allSongs={allSongs}
      onSaveMeta={saveMeta}
      onAddSong={addSong}
      onRemoveItem={removeItem}
      onUpdateItemTranspose={updateTranspose}
      onUpdateItemCapo={updateCapo}
      onUpdateItemNotes={updateNotes}
      onReorder={reorder}
      onSaveVersion={saveVersion}
    />
  );
}
