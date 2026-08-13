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
import {
  assignToService,
  unassignFromService,
  getServiceAssignments,
  getRotaCandidates,
} from '@/server/actions/service';
import type { RotaRole } from '@/server/actions/rota.constants';
import { requireAdminOrAssignedLeader } from '@/server/auth/require';
import { PlaylistEditorClient } from '@/components/playlists/PlaylistEditorClient';
import { RotaBlock } from '@/components/playlists/RotaBlock';
import type { PlaylistItemData, SongPickerItem } from '@/components/playlists/PlaylistEditorClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaylistEditPage({ params }: PageProps) {
  const { id } = await params;
  // Admin OR a leader who is on this program's rota. RLS will also enforce
  // this at the DB layer for item writes; this is just the page-level gate.
  const session = await requireAdminOrAssignedLeader(id);
  const isAdmin = session.profile.role === 'admin';

  const [playlist, songs, assignments] = await Promise.all([
    getPlaylist(id),
    listSongs(),
    getServiceAssignments(id),
  ]);
  if (!playlist) notFound();

  // Rota candidates are admin-only (and only fetched if admin).
  const candidates = isAdmin ? await getRotaCandidates(id) : [];

  // -------------------------------------------------------------------------
  // Inline server actions — passed as props to the client component.
  // -------------------------------------------------------------------------

  async function saveMeta(scheduledFor: string, description: string) {
    'use server';
    await updatePlaylist(id, {
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

  // assignToService/unassignFromService live in a `server-only` module, so they
  // are plain server functions rather than server actions and cannot be handed
  // to a client component directly — React refuses to serialise them and the
  // whole page 500s. Wrap them like every other action on this page.
  async function assign(input: { playlist_id: string; role: RotaRole; member_id: string }) {
    'use server';
    await assignToService(input);
  }

  async function unassign(input: { playlist_id: string; role: RotaRole; member_id: string }) {
    'use server';
    await unassignFromService(input);
  }

  // Map to plain serialisable shapes for the client component
  const initialItems: PlaylistItemData[] = playlist.items.map((item) => ({
    id: item.id,
    song_id: item.song_id,
    position: item.position,
    transpose_semitones: item.transpose_semitones,
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
    <div className="grid gap-6">
      {isAdmin && (
        <RotaBlock
          playlistId={id}
          assignments={assignments}
          candidates={candidates}
          canEdit={true}
          assign={assign}
          unassign={unassign}
        />
      )}
      <PlaylistEditorClient
        playlistId={id}
        initialDate={playlist.scheduled_for ?? ''}
        initialDesc={playlist.description ?? ''}
        initialItems={initialItems}
        allSongs={allSongs}
        onSaveMeta={saveMeta}
        onAddSong={addSong}
        onRemoveItem={removeItem}
        onUpdateItemTranspose={updateTranspose}
        onUpdateItemNotes={updateNotes}
        onReorder={reorder}
        onSaveVersion={saveVersion}
      />
    </div>
  );
}
