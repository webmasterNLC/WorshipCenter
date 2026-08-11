import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/server/auth/require';
import { getSong, updateSong, deleteSong, transposeSongToKey } from '@/server/actions/songs';
import { runAction } from '@/server/actions/_action-result';
import { SongEditor } from '@/components/editor/SongEditor';
import { DeleteSongButton } from '@/components/songs/DeleteSongButton';

// One name per pitch class, spelled the way charts conventionally do it —
// Eb rather than D#, because the stored name also decides whether the whole
// chart comes out in flats or sharps (detectKeyAccidental).
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'] as const;

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

  async function handleDelete() {
    'use server';
    await deleteSong(id);
    redirect('/songs');
  }

  async function rebaseKeyAction(form: FormData) {
    'use server';
    const result = await runAction(() =>
      transposeSongToKey({ id, key: String(form.get('key') ?? '') }),
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

      <section className="grid gap-3 rounded-2xl border border-(--color-border) p-5">
        <div>
          <h2 className="font-display text-lg">Transpose chart</h2>
          <p className="text-sm text-(--color-muted-fg)">
            Rewrites the chords so the chart is stored in the key you pick.
            Programs show a song at its stored key by default, so put it in the
            key the band actually plays.
          </p>
        </div>
        <p className="text-xs text-(--color-muted-fg)">
          Currently stored in <strong>{song.original_key}</strong>
          {song.imported_key
            ? ` · imported in ${song.imported_key}`
            : ' · never transposed'}
          . This is different from the Key field above, which only relabels a
          wrongly detected key without moving any chords.
        </p>
        <form action={rebaseKeyAction} className="flex flex-wrap items-center gap-2">
          <select
            name="key"
            defaultValue={song.original_key}
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            aria-label="Target key"
          >
            {(song.original_key.endsWith('m') ? MINOR_KEYS : MAJOR_KEYS).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-(--color-border) px-4 py-2 text-sm font-medium hover:border-(--color-accent) hover:text-(--color-accent)"
          >
            Transpose
          </button>
        </form>
        <p className="text-xs text-(--color-muted-fg)">
          A program&apos;s transpose setting is an offset from the stored key, so
          any program already using this song shifts by the same amount. Worth a
          look afterwards if it is on an upcoming setlist.
        </p>
      </section>

      <section className="grid gap-2 rounded-2xl border border-(--color-danger)/30 p-5 mt-2">
        <h2 className="text-xs uppercase tracking-[0.22em] text-(--color-danger)">
          Danger zone
        </h2>
        <p className="text-sm text-(--color-muted-fg)">
          Deleting a song also removes it from every program (setlist) it
          currently appears in. This cannot be undone.
        </p>
        <div>
          <DeleteSongButton
            songTitle={primary?.title ?? 'this song'}
            onConfirm={handleDelete}
          />
        </div>
      </section>
    </div>
  );
}
