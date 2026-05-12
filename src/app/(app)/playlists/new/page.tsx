import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/server/auth/require';
import { createPlaylist } from '@/server/actions/playlists';
import { runAction } from '@/server/actions/_action-result';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewPlaylistPage({ searchParams }: PageProps) {
  await requireRole('admin');
  const { error } = await searchParams;

  async function newPlaylistAction(form: FormData) {
    'use server';
    const scheduledFor = String(form.get('scheduled_for') ?? '').trim() || undefined;
    const description = String(form.get('description') ?? '').trim() || undefined;

    const result = await runAction(() =>
      createPlaylist({ scheduled_for: scheduledFor, description }),
    );

    if (!result.ok) {
      redirect(`/playlists/new?error=${encodeURIComponent(result.error.message)}`);
    }
    redirect(`/playlists/${result.data.id}/edit`);
  }

  return (
    <div className="grid gap-6 max-w-lg">
      <header className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.22em] text-(--color-muted-fg)">
          Programs · New
        </span>
        <h1 className="font-display-tight text-3xl md:text-4xl">
          New <em className="text-(--color-accent) not-italic">program</em>.
        </h1>
        <p className="text-sm text-(--color-muted-fg) mt-1">
          Pick the Sunday this program is for. You can add songs and assign the rota afterwards.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-(--color-danger)/40 bg-(--color-danger)/10 px-4 py-3 text-sm text-(--color-danger)">
          {error}
        </div>
      )}

      <form action={newPlaylistAction} className="grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="scheduled_for" className="text-xs uppercase tracking-[0.16em] text-(--color-muted-fg)">
            Date
          </label>
          <input
            id="scheduled_for"
            name="scheduled_for"
            type="date"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm focus:border-(--color-accent) focus:outline-none"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="description" className="text-xs uppercase tracking-[0.16em] text-(--color-muted-fg)">
            Description (optional)
          </label>
          <textarea
            id="description"
            name="description"
            maxLength={2000}
            rows={3}
            placeholder="Theme, sermon reference, notes for the band…"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm focus:border-(--color-accent) focus:outline-none resize-y"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-(--color-accent) px-5 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
          >
            Create program
          </button>
          <Link
            href="/playlists"
            className="rounded-lg border border-(--color-border) px-5 py-2 text-sm font-medium hover:bg-(--color-muted)"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
