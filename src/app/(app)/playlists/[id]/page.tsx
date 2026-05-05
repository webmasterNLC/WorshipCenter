import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getPlaylist, sharePlaylist } from '@/server/actions/playlists';
import { loadSession } from '@/server/auth/require';
import { runAction } from '@/server/actions/_action-result';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ shared?: string }>;
}

const LANG_FLAG: Record<string, string> = {
  de: '🇩🇪',
  en: '🇬🇧',
  ta: '🇮🇳',
};

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}

export default async function PlaylistPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { shared } = await searchParams;

  const [playlist, session] = await Promise.all([getPlaylist(id), loadSession()]);
  if (!playlist) notFound();

  const isOwnerOrAdmin =
    session?.profile.role === 'admin' ||
    session?.profile.id === playlist.owner_id;

  async function handleShare(form: FormData) {
    'use server';
    const message = String(form.get('message') ?? '').trim() || undefined;
    const result = await runAction(() =>
      sharePlaylist({ playlist_id: id, message }),
    );
    if (result.ok) {
      redirect(`/playlists/${id}?shared=${result.data.recipient_count}`);
    }
    redirect(`/playlists/${id}?shared=error`);
  }

  return (
    <div className="grid gap-6 max-w-2xl">
      {/* Shared banner */}
      {shared && shared !== 'error' && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
          Setlist shared with {shared} member{shared === '1' ? '' : 's'}.
        </div>
      )}
      {shared === 'error' && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          Share failed. Please try again.
        </div>
      )}

      {/* Header */}
      <div className="grid gap-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{playlist.name}</h1>
            {playlist.scheduled_for && (
              <p className="text-sm text-(--color-muted-fg) mt-0.5">
                {formatDate(playlist.scheduled_for)}
              </p>
            )}
            {playlist.description && (
              <p className="text-sm text-(--color-muted-fg) mt-1 whitespace-pre-wrap">
                {playlist.description}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 shrink-0">
            {playlist.items.length > 0 && (
              <Link
                href={`/playlists/${id}/play/0`}
                className="rounded-lg bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
              >
                ▶ Performance
              </Link>
            )}
            {isOwnerOrAdmin && (
              <>
                <Link
                  href={`/playlists/${id}/edit`}
                  className="rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium hover:bg-(--color-muted)"
                >
                  Edit
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Share form (owner/admin) */}
        {isOwnerOrAdmin && (
          <form action={handleShare} className="flex items-center gap-2 mt-2">
            <input
              name="message"
              type="text"
              placeholder="Optional message to recipients…"
              maxLength={2000}
              className="flex-1 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
            />
            <button
              type="submit"
              className="rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium hover:bg-(--color-muted) shrink-0"
            >
              Share with band
            </button>
          </form>
        )}
      </div>

      {/* Items list */}
      {playlist.items.length === 0 ? (
        <p className="text-(--color-muted-fg) text-sm">No songs yet.</p>
      ) : (
        <ol className="grid gap-2">
          {playlist.items.map((item, idx) => {
            const song = item.song;
            if (!song) return null;
            const flag = LANG_FLAG[song.language] ?? '';
            const transposeLabel =
              item.transpose_semitones === 0
                ? 'Original'
                : item.transpose_semitones > 0
                  ? `+${item.transpose_semitones}`
                  : `${item.transpose_semitones}`;

            return (
              <li key={item.id}>
                <Link
                  href={`/playlists/${id}/play/${idx}`}
                  className="flex items-center gap-3 rounded-xl border border-(--color-border) px-4 py-3 hover:bg-(--color-muted) transition-colors"
                >
                  <span className="text-xs font-mono text-(--color-muted-fg) w-5 shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {flag && <span className="mr-1">{flag}</span>}
                      {song.title}
                    </p>
                    <p className="text-xs text-(--color-muted-fg) flex flex-wrap gap-2 mt-0.5">
                      <span className="font-mono">{song.original_key}</span>
                      {item.transpose_semitones !== 0 && (
                        <span className="rounded px-1 bg-(--color-muted) font-mono text-xs">
                          {transposeLabel}
                        </span>
                      )}
                      {item.capo != null && item.capo > 0 && (
                        <span>capo {item.capo}</span>
                      )}
                      {item.performance_notes && (
                        <span className="truncate max-w-[200px] italic">
                          {item.performance_notes}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-(--color-muted-fg) text-sm shrink-0">→</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
