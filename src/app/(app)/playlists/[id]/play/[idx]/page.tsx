import { notFound } from 'next/navigation';
import { getPlaylist, updatePlaylistItem } from '@/server/actions/playlists';
import { PerformanceView } from '@/components/viewer/PerformanceView';
import { canEditPlaylist } from '@/server/auth/require';

interface PageProps {
  params: Promise<{ id: string; idx: string }>;
}

export default async function PerformancePage({ params }: PageProps) {
  const { id, idx: idxStr } = await params;
  const idx = parseInt(idxStr, 10);

  if (isNaN(idx) || idx < 0) notFound();

  const playlist = await getPlaylist(id);
  if (!playlist) notFound();

  const item = playlist.items[idx];
  if (!item) notFound();

  const song = item.song;
  if (!song) notFound();

  const canEdit = await canEditPlaylist(id);

  async function broadcastTranspose(itemId: string, semitones: number) {
    'use server';
    await updatePlaylistItem({ id: itemId, transpose_semitones: semitones });
  }

  return (
    <PerformanceView
      song={song}
      itemId={item.id}
      initialSemitones={item.transpose_semitones}
      playlistId={id}
      currentIdx={idx}
      totalItems={playlist.items.length}
      programLabel={
        playlist.scheduled_for ? `Program · ${playlist.scheduled_for}` : 'Program'
      }
      canEdit={canEdit}
      onBroadcastTranspose={broadcastTranspose}
    />
  );
}
