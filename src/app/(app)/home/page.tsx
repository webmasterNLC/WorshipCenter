import Link from 'next/link';
import { Music, ListMusic, Plus, Users, ArrowRight, BellRing } from 'lucide-react';
import { loadSession } from '@/server/auth/require';
import { getDashboardStats } from '@/server/actions/dashboard';
import { getMyUpcomingDuties } from '@/server/actions/service';
import { ROTA_ROLE_LABEL } from '@/server/actions/service.schemas';

function formatServiceDate(iso: string): { weekday: string; day: string; month: string; year: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    day:     d.toLocaleDateString('en-GB', { day: '2-digit' }),
    month:   d.toLocaleDateString('en-GB', { month: 'long' }),
    year:    d.toLocaleDateString('en-GB', { year: 'numeric' }),
  };
}

function relativeUpdated(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d ago`;
  const w = Math.round(d / 7);
  return `${w}w ago`;
}

export default async function HomePage() {
  const session = await loadSession();
  if (!session) return null;

  const role = session.profile.role;
  const [stats, duties] = await Promise.all([
    getDashboardStats(),
    getMyUpcomingDuties(3),
  ]);

  const canCreatePlaylist = role === 'admin';
  const isAdmin = role === 'admin';

  // Group duties by program so multiple-roles-on-same-day stack together.
  const dutiesByPlaylist = new Map<
    string,
    { scheduled_for: string; roles: string[] }
  >();
  for (const d of duties) {
    const cur = dutiesByPlaylist.get(d.playlist_id);
    if (cur) cur.roles.push(d.role);
    else dutiesByPlaylist.set(d.playlist_id, {
      scheduled_for: d.scheduled_for,
      roles: [d.role],
    });
  }

  const next = stats.nextService;
  const nextDate = next ? formatServiceDate(next.scheduled_for) : null;
  const nextIsDuty = next ? dutiesByPlaylist.has(next.id) : false;

  return (
    <div className="grid gap-8 max-w-5xl">

      {/* Hero greeting + a one-line library ledger (counts demoted from hero) */}
      <header className="grid gap-3 pt-2">
        <h1 className="font-display-tight text-5xl md:text-6xl leading-[0.95]">
          Welcome,<br/>
          <em className="not-italic text-(--color-accent) font-display-tight">{session.profile.display_name}.</em>
        </h1>
        <p className="text-xs uppercase tracking-[0.18em] text-(--color-muted-fg) tabular-nums">
          {stats.songCount} {stats.songCount === 1 ? 'song' : 'songs'}
          {' · '}{stats.playlistCount} {stats.playlistCount === 1 ? 'program' : 'programs'}
          {' · '}{stats.recentSongs.length} recent edits
        </p>
      </header>

      {/* Next service — the page's most useful line, leading where vanity counts used to */}
      {next && nextDate && (
        <Link
          href={`/playlists/${next.id}`}
          className="card-lift group grid grid-cols-[auto_1fr_auto] items-center gap-5 rounded-2xl border border-(--color-accent)/40 bg-(--color-accent)/5 p-5 hover:border-(--color-accent)"
        >
          <div className="grid place-items-center rounded-xl border border-(--color-accent)/30 bg-(--color-bg) px-4 py-2 min-w-20 text-center">
            <div className="text-[0.62rem] uppercase tracking-[0.2em] text-(--color-muted-fg)">{nextDate.weekday}</div>
            <div className="numeral text-4xl mt-0.5">{nextDate.day}</div>
            <div className="text-[0.6rem] uppercase tracking-[0.16em] text-(--color-muted-fg)">{nextDate.month.slice(0, 3)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[0.65rem] uppercase tracking-[0.22em] text-(--color-accent)">Next service</div>
            <p className="font-display-tight text-2xl mt-1">{nextDate.weekday}, {nextDate.day} {nextDate.month}</p>
            <p className="text-sm text-(--color-muted-fg) mt-0.5">
              {next.item_count} {next.item_count === 1 ? 'song' : 'songs'} in the program
              {nextIsDuty && <span className="text-(--color-accent)"> · you&apos;re on duty</span>}
            </p>
          </div>
          <ArrowRight className="size-5 text-(--color-muted-fg) group-hover:text-(--color-accent) transition-colors" aria-hidden />
        </Link>
      )}


      {/* On-duty card — only when the user has upcoming assignments */}
      {dutiesByPlaylist.size > 0 && (
        <section className="grid gap-3 rounded-2xl border border-(--color-accent)/40 bg-(--color-accent)/5 p-5">
          <header className="flex items-center gap-2">
            <BellRing className="size-4 text-(--color-accent)" aria-hidden />
            <h2 className="font-display text-lg">
              You&apos;re on duty
            </h2>
            <span className="text-xs text-(--color-muted-fg)">
              · {dutiesByPlaylist.size} {dutiesByPlaylist.size === 1 ? 'service' : 'services'} ahead
            </span>
          </header>
          <ul className="grid gap-2">
            {Array.from(dutiesByPlaylist.entries()).map(([pid, info]) => {
              const d = formatServiceDate(info.scheduled_for);
              return (
                <li key={pid}>
                  <Link
                    href={`/playlists/${pid}`}
                    className="card-lift grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border border-(--color-border) bg-(--color-bg) p-3 hover:border-(--color-accent)"
                  >
                    <div className="grid place-items-center rounded-lg border border-(--color-border) bg-(--color-muted) px-3 py-1.5 min-w-14 text-center">
                      <div className="text-[0.62rem] uppercase tracking-[0.18em] text-(--color-muted-fg)">{d.weekday}</div>
                      <div className="numeral text-2xl mt-0.5">{d.day}</div>
                      <div className="text-[0.6rem] uppercase tracking-[0.16em] text-(--color-muted-fg) mt-0.5">{d.month.slice(0, 3)}</div>
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-base truncate">
                        {d.weekday}, {d.day} {d.month}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {info.roles.map((r) => (
                          <span
                            key={r}
                            className="rounded-full bg-(--color-accent)/15 text-(--color-accent) px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.14em]"
                          >
                            {ROTA_ROLE_LABEL[r as keyof typeof ROTA_ROLE_LABEL] ?? r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-(--color-muted-fg)" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Two-column: recent songs + quick actions */}
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">

        {/* Recent songs */}
        <section className="grid gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl flex items-baseline gap-2">
              <span className="section-tick" aria-hidden />
              Recently edited
            </h2>
            <Link href="/songs" className="text-sm text-(--color-muted-fg) hover:text-(--color-accent)">
              All songs →
            </Link>
          </div>

          {stats.recentSongs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-(--color-border) p-6 text-sm text-(--color-muted-fg)">
              No songs yet. {isAdmin && (
                <Link href="/songs/new" className="text-(--color-accent) underline">
                  Add the first one →
                </Link>
              )}
            </div>
          ) : (
            <ul className="grid gap-1.5">
              {stats.recentSongs.map((song, idx) => (
                <li key={song.id}>
                  <Link
                    href={`/songs/${song.id}`}
                    className="card-lift grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-4 rounded-xl border border-(--color-border) px-4 py-3 hover:border-(--color-accent)"
                  >
                    <span className="numeral text-base w-6 text-right">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="font-display text-base truncate" lang={song.language}>
                      {song.title}
                    </span>
                    <span className="font-mono text-xs text-(--color-muted-fg) tracking-wide">
                      {song.original_key} · {song.language.toUpperCase()}
                    </span>
                    <span className="text-xs text-(--color-muted-fg) tabular-nums">
                      {relativeUpdated(song.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quick actions */}
        <section className="grid gap-3">
          <h2 className="font-display text-xl flex items-baseline gap-2">
            <span className="section-tick" aria-hidden />
            Quick actions
          </h2>
          <div className="grid gap-2">
            {isAdmin && (
              <Link
                href="/songs/new"
                className="card-lift flex items-center gap-3 rounded-xl border border-(--color-border) px-4 py-3 hover:border-(--color-accent)"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-(--color-muted) text-(--color-accent)">
                  <Plus className="size-4" />
                </span>
                <span className="text-sm">
                  <span className="font-medium block">New song</span>
                  <span className="text-xs text-(--color-muted-fg)">ChordPro editor</span>
                </span>
              </Link>
            )}
            {canCreatePlaylist && (
              <Link
                href="/playlists/new"
                className="card-lift flex items-center gap-3 rounded-xl border border-(--color-border) px-4 py-3 hover:border-(--color-accent)"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-(--color-muted) text-(--color-accent)">
                  <Plus className="size-4" />
                </span>
                <span className="text-sm">
                  <span className="font-medium block">New program</span>
                  <span className="text-xs text-(--color-muted-fg)">Plan a service</span>
                </span>
              </Link>
            )}
            <Link
              href="/songs"
              className="card-lift flex items-center gap-3 rounded-xl border border-(--color-border) px-4 py-3 hover:border-(--color-accent)"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-(--color-muted) text-(--color-accent)">
                <Music className="size-4" />
              </span>
              <span className="text-sm">
                <span className="font-medium block">Browse repertoire</span>
                <span className="text-xs text-(--color-muted-fg)">{stats.songCount} songs in the book</span>
              </span>
            </Link>
            <Link
              href="/playlists"
              className="card-lift flex items-center gap-3 rounded-xl border border-(--color-border) px-4 py-3 hover:border-(--color-accent)"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-(--color-muted) text-(--color-accent)">
                <ListMusic className="size-4" />
              </span>
              <span className="text-sm">
                <span className="font-medium block">All programs</span>
                <span className="text-xs text-(--color-muted-fg)">{stats.playlistCount} planned</span>
              </span>
            </Link>
            {isAdmin && (
              <Link
                href="/admin/users"
                className="card-lift flex items-center gap-3 rounded-xl border border-(--color-border) px-4 py-3 hover:border-(--color-accent)"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-(--color-muted) text-(--color-accent)">
                  <Users className="size-4" />
                </span>
                <span className="text-sm">
                  <span className="font-medium block">Manage members</span>
                  <span className="text-xs text-(--color-muted-fg)">Invitations & roles</span>
                </span>
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
