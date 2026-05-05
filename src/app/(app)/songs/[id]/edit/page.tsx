import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/server/auth/require';
import { getSong, updateSong } from '@/server/actions/songs';
import { runAction } from '@/server/actions/_action-result';
import { SongEditor } from '@/components/editor/SongEditor';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function EditSongPage({ params, searchParams }: PageProps) {
  await requireRole('admin');
  const { id } = await params;
  const { error } = await searchParams;
  const song = await getSong(id);
  if (!song) notFound();

  async function editSongAction(form: FormData) {
    'use server';
    const tagsRaw = String(form.get('tags') ?? '');
    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const bpmRaw = form.get('bpm');
    const bpm = bpmRaw && String(bpmRaw).trim() !== '' ? Number(bpmRaw) : undefined;
    const timeSig = String(form.get('time_signature') ?? '').trim() || undefined;
    const notes = String(form.get('notes') ?? '').trim() || undefined;

    const result = await runAction(() =>
      updateSong(id, {
        title: String(form.get('title') ?? ''),
        language: String(form.get('language') ?? 'en') as 'de' | 'en' | 'ta',
        original_key: String(form.get('original_key') ?? 'G'),
        body_chordpro: String(form.get('body_chordpro') ?? ''),
        bpm,
        time_signature: timeSig,
        notes,
        tags,
      }),
    );

    if (!result.ok) {
      redirect(`/songs/${id}/edit?error=${encodeURIComponent(result.error.code)}`);
    }
    redirect(`/songs/${id}`);
  }

  const initialValues = {
    title: song.title as string,
    language: song.language as string,
    original_key: song.original_key as string,
    bpm: song.bpm as number | null,
    time_signature: song.time_signature as string | null,
    body_chordpro: song.body_chordpro as string,
    notes: song.notes as string | null,
    tags: (song.tags as string[]) ?? [],
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Edit song</h1>
          <p className="text-sm text-(--color-muted-fg) mt-1" lang={initialValues.language}>
            {initialValues.title}
          </p>
        </div>
      </div>
      <SongEditor
        initialValues={initialValues}
        action={editSongAction}
        errorCode={error ?? null}
      />
    </div>
  );
}
