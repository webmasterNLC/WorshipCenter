import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/server/auth/require';
import { getSong, updateSong } from '@/server/actions/songs';
import { runAction } from '@/server/actions/_action-result';
import { SongEditor } from '@/components/editor/SongEditor';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

interface SubmittedTranslation {
  language: 'de' | 'en' | 'ta';
  title: string;
  body_chordpro: string;
  is_primary: boolean;
}

function parseTranslations(form: FormData): SubmittedTranslation[] {
  const raw = String(form.get('translations') ?? '[]');
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as SubmittedTranslation[];
  } catch {
    return [];
  }
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
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    const bpmRaw = form.get('bpm');
    const bpm = bpmRaw && String(bpmRaw).trim() !== '' ? Number(bpmRaw) : undefined;
    const timeSig = String(form.get('time_signature') ?? '').trim() || undefined;
    const notes = String(form.get('notes') ?? '').trim() || undefined;
    const translations = parseTranslations(form);

    const result = await runAction(() =>
      updateSong(id, {
        original_key: String(form.get('original_key') ?? 'G'),
        bpm,
        time_signature: timeSig,
        notes,
        tags,
        translations,
      }),
    );

    if (!result.ok) {
      redirect(`/songs/${id}/edit?error=${encodeURIComponent(result.error.code)}`);
    }
    redirect(`/songs/${id}`);
  }

  const initialValues = {
    original_key: song.original_key,
    bpm: song.bpm,
    time_signature: song.time_signature,
    notes: song.notes,
    tags: song.tags,
    translations: song.translations.map((t) => ({
      language: t.language,
      title: t.title,
      body_chordpro: t.body_chordpro,
      is_primary: t.is_primary,
    })),
  };

  const primary = song.translations.find((t) => t.is_primary) ?? song.translations[0];

  return (
    <div className="grid gap-6 max-w-5xl">
      <header className="grid gap-1">
        <span className="text-xs uppercase tracking-[0.22em] text-(--color-muted-fg)">
          Editing · {song.translations.length} {song.translations.length === 1 ? 'language' : 'languages'}
        </span>
        <h1 className="font-display-tight text-3xl md:text-4xl" lang={primary?.language}>
          {primary?.title ?? 'Untitled'}
        </h1>
      </header>
      <SongEditor
        initialValues={initialValues}
        action={editSongAction}
        errorCode={error ?? null}
      />
    </div>
  );
}
