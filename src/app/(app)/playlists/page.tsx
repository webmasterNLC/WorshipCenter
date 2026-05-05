import Link from 'next/link';
import { listPlaylists } from '@/server/actions/playlists';
import { loadSession } from '@/server/auth/require';

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  // dateStr is YYYY-MM-DD
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}

export default async function PlaylistsPage() {
  const [playlists, session] = await Promise.all([listPlaylists(), loadSession()]);
  const canCreate =
    session?.profile.role === 'admin' || session?.profile.role === 'leader';

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Playlists</h1>
        {canCreate && (
          <Link
            href="/playlists/new"
            className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
          >
            + New playlist
          </Link>
        )}
      </div>

      {playlists.length === 0 ? (
        <p className="text-(--color-muted-fg) text-sm">No playlists yet.</p>
      ) : (
        <ul className="grid gap-2">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <Link
                href={`/playlists/${playlist.id}`}
                className="flex items-center justify-between rounded-xl border border-(--color-border) px-4 py-3 hover:bg-(--color-muted) transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{playlist.name}</p>
                  <p className="text-xs text-(--color-muted-fg) flex flex-wrap gap-2 mt-0.5">
                    {playlist.scheduled_for && (
                      <span>{formatDate(playlist.scheduled_for)}</span>
                    )}
                    {playlist.owner_name && (
                      <span>by {playlist.owner_name}</span>
                    )}
                    <span>
                      {playlist.item_count}{' '}
                      {playlist.item_count === 1 ? 'song' : 'songs'}
                    </span>
                  </p>
                </div>
                <span className="text-(--color-muted-fg) text-sm ml-4">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
