import Link from 'next/link';
import { Plus, CalendarDays } from 'lucide-react';
import { listPlaylists } from '@/server/actions/playlists';
import { loadSession } from '@/server/auth/require';

interface PlaylistRow {
  id: string;
  scheduled_for: string | null;
  owner_name: string | null;
  item_count: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): { weekday: string; day: string; month: string; year: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    day:     d.toLocaleDateString('en-GB', { day: '2-digit' }),
    month:   d.toLocaleDateString('en-GB', { month: 'short' }),
    year:    d.toLocaleDateString('en-GB', { year: 'numeric' }),
  };
}

function PlaylistCard({ p }: { p: PlaylistRow }) {
  const date = p.scheduled_for ? formatDate(p.scheduled_for) : null;
  return (
    <li>
      <Link
        href={`/playlists/${p.id}`}
        className="card-lift grid grid-cols-[auto_1fr_auto] items-center gap-5 rounded-xl border border-(--color-border) p-4 hover:border-(--color-accent)"
      >
        <div className="grid place-items-center rounded-lg border border-(--color-border) bg-(--color-muted) px-3 py-2 min-w-16 text-center">
          {date ? (
            <>
              <div className="text-[0.62rem] uppercase tracking-[0.18em] text-(--color-muted-fg)">{date.weekday}</div>
              <div className="numeral text-2xl mt-0.5">{date.day}</div>
              <div className="text-[0.62rem] uppercase tracking-[0.16em] text-(--color-muted-fg) mt-0.5">{date.month}</div>
            </>
          ) : (
            <CalendarDays className="size-5 text-(--color-muted-fg)" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg truncate">
            {date
              ? `${date.weekday}, ${date.day} ${date.month} ${date.year}`
              : 'Undated program'}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-(--color-muted-fg)">
            <span>{p.item_count} {p.item_count === 1 ? 'song' : 'songs'}</span>
          </p>
        </div>
        <span className="text-(--color-muted-fg) text-sm">→</span>
      </Link>
    </li>
  );
}

export default async function PlaylistsPage() {
  const [playlists, session] = await Promise.all([listPlaylists(), loadSession()]);
  // Only admins create programs now.
  const canCreate = session?.profile.role === 'admin';
  const isAdmin = canCreate;

  const today = todayIso();
  const upcoming: PlaylistRow[] = [];
  const past:     PlaylistRow[] = [];
  const undated:  PlaylistRow[] = [];

  for (const p of playlists) {
    const row: PlaylistRow = {
      id: p.id,
      scheduled_for: p.scheduled_for,
      owner_name: p.owner_name,
      item_count: p.item_count,
    };
    if (!row.scheduled_for) undated.push(row);
    else if (row.scheduled_for >= today) upcoming.push(row);
    else past.push(row);
  }
  upcoming.sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''));
  past.sort((a, b) => (b.scheduled_for ?? '').localeCompare(a.scheduled_for ?? ''));

  return (
    <div className="grid gap-8 max-w-5xl">
      <header className="grid gap-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs uppercase tracking-[0.22em] text-(--color-muted-fg)">
            Programs
          </span>
          {canCreate && (
            <Link
              href="/playlists/new"
              className="flex items-center gap-2 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
            >
              <Plus className="size-4" aria-hidden />
              New program
            </Link>
          )}
        </div>
      </header>

      {playlists.length === 0 && (
        <div className="rounded-xl border border-dashed border-(--color-border) p-8 text-center">
          <CalendarDays className="mx-auto size-8 text-(--color-muted-fg)" aria-hidden />
          <p className="mt-3 font-display text-lg">No programs yet.</p>
          <p className="mt-1 text-sm text-(--color-muted-fg)">
            {canCreate ? 'Create the first one to plan a service.' : 'An admin will plan the next service soon.'}
          </p>
          {canCreate && (
            <Link
              href="/playlists/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
            >
              <Plus className="size-4" aria-hidden /> New program
            </Link>
          )}
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-display text-xl flex items-baseline gap-2">
            <span className="section-tick" aria-hidden />
            Upcoming
            <span className="text-xs text-(--color-muted-fg) font-sans tracking-[0.16em] uppercase">
              {upcoming.length}
            </span>
          </h2>
          <ul className="grid gap-2">
            {upcoming.map((p) => <PlaylistCard key={p.id} p={p} />)}
          </ul>
        </section>
      )}

      {undated.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-display text-xl flex items-baseline gap-2">
            <span className="section-tick" aria-hidden />
            Drafts
            <span className="text-xs text-(--color-muted-fg) font-sans tracking-[0.16em] uppercase">
              {undated.length}
            </span>
          </h2>
          <ul className="grid gap-2">
            {undated.map((p) => <PlaylistCard key={p.id} p={p} />)}
          </ul>
        </section>
      )}

      {/* Past services — admin-only (non-admins get the past hidden by listPlaylists). */}
      {isAdmin && past.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-display text-xl flex items-baseline gap-2">
            <span className="section-tick" aria-hidden />
            Past services
            <span className="text-xs text-(--color-muted-fg) font-sans tracking-[0.16em] uppercase">
              {past.length}
            </span>
          </h2>
          <ul className="grid gap-2">
            {past.slice(0, 12).map((p) => <PlaylistCard key={p.id} p={p} />)}
          </ul>
          {past.length > 12 && (
            <p className="text-xs text-(--color-muted-fg) mt-1 px-1">
              Showing 12 of {past.length} past services.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
