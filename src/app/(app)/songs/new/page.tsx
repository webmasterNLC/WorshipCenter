import { redirect } from 'next/navigation';
import { requireRole } from '@/server/auth/require';
import { createSong } from '@/server/actions/songs';
import { runAction } from '@/server/actions/_action-result';
import { SongEditor } from '@/components/editor/SongEditor';

interface PageProps {
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

export default async function NewSongPage({ searchParams }: PageProps) {
  await requireRole('admin');
  const { error } = await searchParams;

  async function newSongAction(form: FormData) {
    'use server';
    const tagsRaw = String(form.get('tags') ?? '');
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    const bpmRaw = form.get('bpm');
    const bpm = bpmRaw && String(bpmRaw).trim() !== '' ? Number(bpmRaw) : undefined;
    const timeSig = String(form.get('time_signature') ?? '').trim() || undefined;
    const notes = String(form.get('notes') ?? '').trim() || undefined;
    const translations = parseTranslations(form);

    const result = await runAction(() =>
      createSong({
        original_key: String(form.get('original_key') ?? 'G'),
        bpm,
        time_signature: timeSig,
        notes,
        tags,
        translations,
      }),
    );

    if (!result.ok) {
      redirect(`/songs/new?error=${encodeURIComponent(result.error.code)}`);
    }
    redirect(`/songs/${result.data.id}`);
  }

  return (
    <div className="grid gap-6 max-w-5xl">
      <header className="grid gap-1">
        <span className="text-xs uppercase tracking-[0.22em] text-(--color-muted-fg)">
          Repertoire · New entry
        </span>
        <h1 className="font-display-tight text-3xl md:text-4xl">
          A new <em className="text-(--color-accent) not-italic">song</em>.
        </h1>
        <p className="text-sm text-(--color-muted-fg) mt-1">
          Add the song in one or more languages. The primary language is what shows in lists and search.
        </p>
      </header>
      <SongEditor action={newSongAction} errorCode={error ?? null} />
    </div>
  );
}
