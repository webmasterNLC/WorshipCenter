import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/server/auth/require';
import { createPlaylist } from '@/server/actions/playlists';
import { runAction } from '@/server/actions/_action-result';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewPlaylistPage({ searchParams }: PageProps) {
  await requireRole('admin', 'leader');
  const { error } = await searchParams;

  async function newPlaylistAction(form: FormData) {
    'use server';
    const name = String(form.get('name') ?? '').trim();
    const scheduledFor = String(form.get('scheduled_for') ?? '').trim() || undefined;
    const description = String(form.get('description') ?? '').trim() || undefined;

    const result = await runAction(() =>
      createPlaylist({ name, scheduled_for: scheduledFor, description }),
    );

    if (!result.ok) {
      redirect(`/playlists/new?error=${encodeURIComponent(result.error.message)}`);
    }
    redirect(`/playlists/${result.data.id}/edit`);
  }

  return (
    <div className="grid gap-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold">New playlist</h1>
        <p className="text-sm text-(--color-muted-fg) mt-1">
          Create a new setlist for your band.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={newPlaylistAction} className="grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="name" className="text-sm font-medium">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={120}
            placeholder="e.g. Sunday Service 4 May"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="scheduled_for" className="text-sm font-medium">
            Date (optional)
          </label>
          <input
            id="scheduled_for"
            name="scheduled_for"
            type="date"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="description" className="text-sm font-medium">
            Description (optional)
          </label>
          <textarea
            id="description"
            name="description"
            maxLength={2000}
            rows={3}
            placeholder="Optional notes about this setlist…"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent) resize-y"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-(--color-accent) px-5 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
          >
            Create playlist
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
