'use client';
import { useState, useTransition, useMemo } from 'react';
import { Plus, X, Star, Languages } from 'lucide-react';
import { parseChord, tokenizeChordPro, renderToBlocks } from '@/lib/chordpro';
import { ChordLine } from '@/components/viewer/ChordLine';

type Lang = 'de' | 'en' | 'ta';

const LANG_LABEL: Record<Lang, string> = {
  de: 'Deutsch',
  en: 'English',
  ta: 'தமிழ்',
};

const ALL_LANGS: Lang[] = ['en', 'de', 'ta'];

interface Translation {
  language: Lang;
  title: string;
  body_chordpro: string;
  is_primary: boolean;
}

interface SongEditorProps {
  initialValues?: {
    original_key?: string;
    bpm?: number | null;
    time_signature?: string | null;
    notes?: string | null;
    tags?: string[];
    translations?: Translation[];
  };
  action: (form: FormData) => Promise<void>;
  errorCode?: string | null;
}

function friendlyError(code: string): string {
  switch (code) {
    case 'FORBIDDEN':  return 'You do not have permission to do this.';
    case 'VALIDATION': return 'Please check the form fields and try again.';
    case 'INTERNAL':   return 'Something went wrong. Please try again.';
    default:           return `Error: ${code}`;
  }
}

function defaultTranslations(initial?: Translation[]): Translation[] {
  if (initial && initial.length > 0) return initial;
  return [{ language: 'en', title: '', body_chordpro: '', is_primary: true }];
}

export function SongEditor({ initialValues, action, errorCode }: SongEditorProps) {
  const [translations, setTranslations] = useState<Translation[]>(
    () => defaultTranslations(initialValues?.translations),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPending, startTransition] = useTransition();

  const active = translations[activeIdx] ?? translations[0];
  if (!active) {
    // Should never happen — defaultTranslations always returns >= 1
    throw new Error('No active translation');
  }

  const blocks = useMemo(() => renderToBlocks(active.body_chordpro), [active.body_chordpro]);
  const unparseableChords = useMemo(() => {
    const tokens = tokenizeChordPro(active.body_chordpro);
    return tokens
      .filter((t) => t.type === 'chord' && parseChord(t.value) === null)
      .map((t) => (t.type === 'chord' ? t.value : ''));
  }, [active.body_chordpro]);

  const usedLangs = new Set(translations.map((t) => t.language));
  const availableLangs = ALL_LANGS.filter((l) => !usedLangs.has(l));

  function patchActive(patch: Partial<Translation>) {
    setTranslations((prev) =>
      prev.map((t, i) => (i === activeIdx ? { ...t, ...patch } : t)),
    );
  }

  function addLanguage(lang: Lang) {
    setTranslations((prev) => {
      const next: Translation[] = [
        ...prev,
        { language: lang, title: '', body_chordpro: '', is_primary: false },
      ];
      return next;
    });
    setActiveIdx(translations.length); // new tab becomes active
  }

  function removeAt(idx: number) {
    setTranslations((prev) => {
      if (prev.length <= 1) return prev;
      const removed = prev[idx];
      const next = prev.filter((_, i) => i !== idx);
      // If we removed the primary, promote the first remaining to primary.
      if (removed?.is_primary && next.length > 0 && next[0]) {
        next[0] = { ...next[0], is_primary: true };
      }
      return next;
    });
    setActiveIdx((cur) => Math.max(0, Math.min(cur, translations.length - 2)));
  }

  function makeActivePrimary() {
    setTranslations((prev) =>
      prev.map((t, i) => ({ ...t, is_primary: i === activeIdx })),
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set('translations', JSON.stringify(translations));
    startTransition(() => action(form));
  };

  return (
    <div className="grid gap-6">
      {errorCode && (
        <div className="rounded-lg border border-(--color-danger) bg-(--color-danger)/10 px-4 py-3 text-sm text-(--color-danger)">
          {friendlyError(errorCode)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6">

        {/* Song-level metadata */}
        <fieldset className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <legend className="sr-only">Song metadata</legend>
          <div>
            <label className="block text-xs uppercase tracking-[0.16em] text-(--color-muted-fg) mb-1.5">Key</label>
            <input
              name="original_key"
              required
              pattern="^[A-G](#|b)?m?$"
              title="e.g. G, F#m, Bb"
              defaultValue={initialValues?.original_key ?? 'G'}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.16em] text-(--color-muted-fg) mb-1.5">BPM</label>
            <input
              name="bpm"
              type="number"
              min={30}
              max={300}
              defaultValue={initialValues?.bpm ?? ''}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.16em] text-(--color-muted-fg) mb-1.5">Time sig.</label>
            <input
              name="time_signature"
              placeholder="4/4"
              pattern="^\d+/\d+$"
              defaultValue={initialValues?.time_signature ?? ''}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.16em] text-(--color-muted-fg) mb-1.5">Tags</label>
            <input
              name="tags"
              placeholder="hymn, christmas"
              defaultValue={initialValues?.tags?.join(', ') ?? ''}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            />
          </div>
        </fieldset>

        {/* Language tabs */}
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Languages className="size-4 text-(--color-muted-fg)" aria-hidden />
              <span className="text-xs uppercase tracking-[0.18em] text-(--color-muted-fg)">
                Translations
              </span>
            </div>
            {!active.is_primary && (
              <button
                type="button"
                onClick={makeActivePrimary}
                className="flex items-center gap-1.5 rounded-md border border-(--color-border) px-2.5 py-1 text-xs hover:border-(--color-accent) hover:text-(--color-accent) transition-colors"
              >
                <Star className="size-3" aria-hidden />
                Make primary
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-(--color-border) pb-px">
            {translations.map((t, i) => {
              const isActive = i === activeIdx;
              const labelText = LANG_LABEL[t.language];
              return (
                <div key={t.language} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`flex items-center gap-1.5 rounded-t-lg border-b-0 border px-3 py-2 text-sm transition-colors -mb-px ${
                      isActive
                        ? 'border-(--color-border) bg-(--color-bg) font-medium text-(--color-fg)'
                        : 'border-transparent text-(--color-muted-fg) hover:text-(--color-fg)'
                    }`}
                  >
                    {t.is_primary && <Star className="size-3 text-(--color-accent) fill-(--color-accent)" aria-hidden />}
                    <span lang={t.language}>{labelText}</span>
                  </button>
                  {translations.length > 1 && isActive && (
                    <button
                      type="button"
                      onClick={() => removeAt(i)}
                      aria-label={`Remove ${labelText} translation`}
                      className="ml-0.5 grid size-5 place-items-center rounded-full text-(--color-muted-fg) hover:bg-(--color-danger)/10 hover:text-(--color-danger)"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  )}
                </div>
              );
            })}

            {availableLangs.length > 0 && (
              <div className="ml-1 flex items-center gap-1">
                {availableLangs.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => addLanguage(lang)}
                    className="flex items-center gap-1 rounded-md border border-dashed border-(--color-border) px-2 py-1 text-xs text-(--color-muted-fg) hover:border-(--color-accent) hover:text-(--color-accent) transition-colors"
                    title={`Add ${LANG_LABEL[lang]} translation`}
                  >
                    <Plus className="size-3" aria-hidden />
                    {LANG_LABEL[lang]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active translation: title + split-pane chordpro/preview */}
          <div className="grid gap-4 rounded-b-xl border border-t-0 border-(--color-border) bg-(--color-bg) p-4">
            <div>
              <label className="block text-xs uppercase tracking-[0.16em] text-(--color-muted-fg) mb-1.5">
                Title <span lang={active.language} className="normal-case tracking-normal">({LANG_LABEL[active.language]})</span>
              </label>
              <input
                value={active.title}
                onChange={(e) => patchActive({ title: e.target.value })}
                required
                lang={active.language}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 font-display text-lg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.16em] text-(--color-muted-fg)">
                  ChordPro source
                </label>
                <textarea
                  value={active.body_chordpro}
                  onChange={(e) => patchActive({ body_chordpro: e.target.value })}
                  required
                  rows={18}
                  className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm font-mono resize-y"
                  placeholder="[G]Amazing [C]grace..."
                />
                {unparseableChords.length > 0 && (
                  <div className="text-xs text-(--color-danger) rounded border border-(--color-danger)/30 px-3 py-2">
                    Unrecognized chords: {unparseableChords.join(', ')}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.16em] text-(--color-muted-fg)">
                  Live preview
                </p>
                <div className="rounded-lg border border-(--color-border) bg-(--color-muted) px-4 py-4 min-h-[300px] overflow-auto">
                  {blocks.map((block, i) => (
                    <ChordLine key={i} block={block} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div>
          <label className="block text-xs uppercase tracking-[0.16em] text-(--color-muted-fg) mb-1.5">Notes</label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={initialValues?.notes ?? ''}
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm resize-y"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-(--color-muted-fg)">
            {translations.length} {translations.length === 1 ? 'translation' : 'translations'} ·{' '}
            primary: <span className="font-medium" lang={translations.find((t) => t.is_primary)?.language}>
              {LANG_LABEL[translations.find((t) => t.is_primary)?.language ?? 'en']}
            </span>
          </p>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-(--color-accent) px-6 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save song'}
          </button>
        </div>
      </form>
    </div>
  );
}
