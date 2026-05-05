'use client';
import { useState, useTransition, useMemo } from 'react';
import { parseChord, tokenizeChordPro, renderToBlocks } from '@/lib/chordpro';
import { ChordLine } from '@/components/viewer/ChordLine';

interface SongEditorProps {
  initialValues?: {
    title?: string;
    language?: string;
    original_key?: string;
    bpm?: number | null;
    time_signature?: string | null;
    body_chordpro?: string;
    notes?: string | null;
    tags?: string[];
  };
  action: (form: FormData) => Promise<void>;
  errorCode?: string | null;
}

function friendlyError(code: string): string {
  switch (code) {
    case 'FORBIDDEN': return 'You do not have permission to do this.';
    case 'VALIDATION': return 'Please check the form fields and try again.';
    case 'INTERNAL': return 'Something went wrong. Please try again.';
    default: return `Error: ${code}`;
  }
}

export function SongEditor({ initialValues, action, errorCode }: SongEditorProps) {
  const [body, setBody] = useState(initialValues?.body_chordpro ?? '');
  const [isPending, startTransition] = useTransition();

  const blocks = useMemo(() => renderToBlocks(body), [body]);

  const unparseableChords = useMemo(() => {
    const tokens = tokenizeChordPro(body);
    return tokens
      .filter((t) => t.type === 'chord' && parseChord(t.value) === null)
      .map((t) => (t.type === 'chord' ? t.value : ''));
  }, [body]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => action(form));
  };

  return (
    <div className="grid gap-6">
      {errorCode && (
        <div className="rounded-lg border border-(--color-danger) bg-(--color-danger)/10 px-4 py-3 text-sm text-(--color-danger)">
          {friendlyError(errorCode)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        {/* Metadata row */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              name="title"
              required
              defaultValue={initialValues?.title ?? ''}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Language</label>
            <select
              name="language"
              defaultValue={initialValues?.language ?? 'en'}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="ta">தமிழ்</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Key</label>
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
            <label className="block text-sm font-medium mb-1">BPM</label>
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
            <label className="block text-sm font-medium mb-1">Time sig.</label>
            <input
              name="time_signature"
              placeholder="4/4"
              pattern="^\d+/\d+$"
              defaultValue={initialValues?.time_signature ?? ''}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
            <input
              name="tags"
              defaultValue={initialValues?.tags?.join(', ') ?? ''}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Split pane */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">ChordPro source</label>
            <textarea
              name="body_chordpro"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={20}
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
            <p className="text-sm font-medium">Live preview</p>
            <div className="rounded-lg border border-(--color-border) bg-(--color-muted) px-4 py-4 min-h-[300px] overflow-auto">
              {blocks.map((block, i) => (
                <ChordLine key={i} block={block} />
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={initialValues?.notes ?? ''}
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm resize-y"
          />
        </div>

        <div className="flex justify-end">
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
