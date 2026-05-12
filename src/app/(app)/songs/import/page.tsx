import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { requireRole } from '@/server/auth/require';
import { importPnwChordsSong } from '@/server/actions/import';
import { runAction } from '@/server/actions/_action-result';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function ImportSongPage({ searchParams }: PageProps) {
  await requireRole('admin');
  const { error } = await searchParams;

  async function doImport(form: FormData) {
    'use server';
    const url = String(form.get('url') ?? '').trim();
    const result = await runAction(() => importPnwChordsSong({ url }));
    if (!result.ok) {
      redirect(`/songs/import?error=${encodeURIComponent(result.error.message)}`);
    }
    // Land in the edit view so the admin can review the parsed body.
    redirect(`/songs/${result.data.id}/edit`);
  }

  return (
    <div className="grid gap-6 max-w-xl">
      <Link
        href="/songs"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-(--color-muted-fg) hover:text-(--color-accent) w-fit"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to repertoire
      </Link>

      <header className="grid gap-2">
        <h1 className="font-display-tight text-3xl md:text-4xl">
          Import a <em className="text-(--color-accent) not-italic">song</em>.
        </h1>
        <p className="text-sm text-(--color-muted-fg)">
          Paste a <span className="font-mono text-xs">pnwchords.com</span> song URL. We&apos;ll
          fetch the chord chart, convert it to ChordPro, and drop you into the
          editor to review.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-(--color-danger)/40 bg-(--color-danger)/10 px-4 py-3 text-sm text-(--color-danger)">
          {error}
        </div>
      )}

      <form action={doImport} className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-xs uppercase tracking-[0.16em] text-(--color-muted-fg)">
            Source URL
          </span>
          <input
            type="url"
            name="url"
            required
            placeholder="https://pnwchords.com/<song-slug>/"
            pattern="https://(www\.)?pnwchords\.com/.*"
            title="Must be a pnwchords.com URL"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm font-mono focus:border-(--color-accent) focus:outline-none"
          />
        </label>

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
        >
          <Download className="size-4" aria-hidden />
          Fetch &amp; import
        </button>
      </form>

      <details className="rounded-xl border border-(--color-border) p-4 text-sm text-(--color-muted-fg)">
        <summary className="cursor-pointer text-(--color-fg)">How it works</summary>
        <ul className="mt-2 space-y-1 list-disc pl-5">
          <li>
            We fetch the page server-side, no client-side request to pnwchords.
          </li>
          <li>
            The site is identified as a chord-chart resource (robots.txt allows
            crawling). Each import is one human-triggered request — no bulk
            scraping.
          </li>
          <li>
            The chord-above-lyric format is converted to inline{' '}
            <span className="font-mono">[Chord]lyric</span> ChordPro that fits
            our editor + viewer.
          </li>
          <li>
            We default the language to English and infer the key from the first
            chord. Review and adjust in the editor that opens after import.
          </li>
        </ul>
      </details>
    </div>
  );
}
