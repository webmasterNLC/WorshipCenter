import { notFound } from 'next/navigation';
import { getSong } from '@/server/actions/songs';
import { SongViewer } from '@/components/viewer/SongViewer';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SongPage({ params }: PageProps) {
  const { id } = await params;
  const song = await getSong(id);
  if (!song) notFound();
  return <SongViewer song={song} />;
}
