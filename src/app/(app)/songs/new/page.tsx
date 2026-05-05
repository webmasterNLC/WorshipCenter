import { redirect } from 'next/navigation';
import { requireRole } from '@/server/auth/require';
import { createSong } from '@/server/actions/songs';
import { runAction } from '@/server/actions/_action-result';
import { SongEditor } from '@/components/editor/SongEditor';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewSongPage({ searchParams }: PageProps) {
  await requireRole('admin');
  const { error } = await searchParams;

  async function newSongAction(form: FormData) {
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
      createSong({
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
      redirect(`/songs/new?error=${encodeURIComponent(result.error.code)}`);
    }
    redirect(`/songs/${result.data.id}`);
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">New song</h1>
        <p className="text-sm text-(--color-muted-fg) mt-1">Create a new ChordPro song.</p>
      </div>
      <SongEditor action={newSongAction} errorCode={error ?? null} />
    </div>
  );
}
