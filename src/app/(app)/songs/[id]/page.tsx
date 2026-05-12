import { notFound } from 'next/navigation';
import { getSong } from '@/server/actions/songs';
import { loadSession } from '@/server/auth/require';
import { SongViewer } from '@/components/viewer/SongViewer';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SongPage({ params }: PageProps) {
  const { id } = await params;
  const [song, session] = await Promise.all([getSong(id), loadSession()]);
  if (!song) notFound();
  const canEdit = session?.profile.role === 'admin';
  return (
    <SongViewer
      song={song}
      {...(canEdit ? { editHref: `/songs/${id}/edit` } : {})}
    />
  );
}
