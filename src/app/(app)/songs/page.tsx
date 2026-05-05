import Link from 'next/link';
import { listSongs } from '@/server/actions/songs';
import { loadSession } from '@/server/auth/require';

export default async function SongsPage() {
  const [songs, session] = await Promise.all([listSongs(), loadSession()]);
  const isAdmin = session?.profile.role === 'admin';

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Songs</h1>
        {isAdmin && (
          <Link
            href="/songs/new"
            className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
          >
            + New song
          </Link>
        )}
      </div>

      {songs.length === 0 ? (
        <p className="text-(--color-muted-fg) text-sm">No songs yet.</p>
      ) : (
        <ul className="grid gap-2">
          {songs.map((song) => (
            <li key={song.id}>
              <Link
                href={`/songs/${song.id}`}
                className="flex items-center justify-between rounded-xl border border-(--color-border) px-4 py-3 hover:bg-(--color-muted) transition-colors"
              >
                <div className="min-w-0">
                  <p
                    className="font-medium truncate"
                    lang={song.language}
                  >
                    {song.title}
                  </p>
                  <p className="text-xs text-(--color-muted-fg) flex gap-2 mt-0.5">
                    <span className="uppercase">{song.language}</span>
                    <span className="font-mono">{song.original_key}</span>
                    {song.bpm && <span>{song.bpm} BPM</span>}
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
