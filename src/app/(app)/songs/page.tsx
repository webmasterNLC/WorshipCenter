import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listSongs } from '@/server/actions/songs';
import { loadSession } from '@/server/auth/require';
import { SongsListClient } from '@/components/songs/SongsListClient';

export default async function SongsPage() {
  const [songs, session] = await Promise.all([listSongs(), loadSession()]);
  const isAdmin = session?.profile.role === 'admin';

  return (
    <div className="grid gap-6 max-w-5xl">
      <header className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.22em] text-(--color-muted-fg)">
          Repertoire
        </span>
        <div className="flex items-end justify-between gap-4">
          <h1 className="font-display-tight text-4xl md:text-5xl">
            The <em className="text-(--color-accent) not-italic">songbook</em>.
          </h1>
          {isAdmin && (
            <Link
              href="/songs/new"
              className="flex items-center gap-2 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
            >
              <Plus className="size-4" aria-hidden />
              New song
            </Link>
          )}
        </div>
      </header>

      <SongsListClient
        songs={songs.map((s) => ({
          id: s.id,
          title: s.title,
          language: s.language,
          languages: s.languages,
          original_key: s.original_key,
          bpm: s.bpm ?? null,
          tags: s.tags ?? [],
          updated_at: s.updated_at,
        }))}
      />
    </div>
  );
}
