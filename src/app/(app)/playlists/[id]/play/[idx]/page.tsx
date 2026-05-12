import { notFound } from 'next/navigation';
import { getPlaylist } from '@/server/actions/playlists';
import { SongViewer } from '@/components/viewer/SongViewer';
import { PerformanceNav } from '@/components/viewer/PerformanceNav';

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

  return (
    <SongViewer
      song={song}
      initialSemitones={item.transpose_semitones}
      navigationSlot={
        <PerformanceNav
          playlistId={id}
          currentIdx={idx}
          totalItems={playlist.items.length}
          programLabel={
            playlist.scheduled_for
              ? `Program · ${playlist.scheduled_for}`
              : 'Program'
          }
        />
      }
    />
  );
}
