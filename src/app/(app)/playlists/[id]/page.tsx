import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Play, Send } from 'lucide-react';
import { getPlaylist } from '@/server/actions/playlists';
import {
  getServiceAssignments,
  notifyRota,
} from '@/server/actions/service';
import { ROTA_ROLE_LABEL, ROTA_ROLES, type RotaRole } from '@/server/actions/service.schemas';
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

function formatDate(dateStr: string | null): { weekday: string; day: string; month: string; year: string } | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    day:     d.toLocaleDateString('en-GB', { day: '2-digit' }),
    month:   d.toLocaleDateString('en-GB', { month: 'long' }),
    year:    d.toLocaleDateString('en-GB', { year: 'numeric' }),
  };
}

export default async function PlaylistPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { shared } = await searchParams;

  const [playlist, session] = await Promise.all([getPlaylist(id), loadSession()]);
  if (!playlist) notFound();

  const isAdmin = session?.profile.role === 'admin';

  // Rota is read-only on the detail page — assignment happens in edit mode.
  const assignments = await getServiceAssignments(id);

  // Leader can open edit (= edit songs) only if admin has assigned them
  // to this program's rota. Viewers never edit.
  const canEditItems =
    isAdmin ||
    (session?.profile.role === 'leader' &&
      assignments.some((a) => a.member_id === session.profile.id));

  async function handleNotify(form: FormData) {
    'use server';
    const message = String(form.get('message') ?? '').trim() || undefined;
    const result = await runAction(() => notifyRota(id, message));
    if (result.ok) {
      redirect(`/playlists/${id}?shared=${result.data.recipient_count}`);
    }
    redirect(`/playlists/${id}?shared=error`);
  }

  const date = formatDate(playlist.scheduled_for);

  return (
    <div className="grid gap-6 max-w-3xl">
      {shared && shared !== 'error' && (
        <div className="rounded-lg border border-(--color-accent)/40 bg-(--color-accent)/10 px-4 py-3 text-sm">
          Notification sent to {shared} rota member{shared === '1' ? '' : 's'}.
        </div>
      )}
      {shared === 'error' && (
        <div className="rounded-lg border border-(--color-danger)/40 bg-(--color-danger)/10 px-4 py-3 text-sm text-(--color-danger)">
          Notification failed. Please try again.
        </div>
      )}

      {/* Header */}
      <header className="grid gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex items-start gap-4">
            {date && (
              <div className="grid place-items-center rounded-xl border border-(--color-border) bg-(--color-muted) px-3 py-2 text-center min-w-16 shrink-0">
                <div className="text-[0.62rem] uppercase tracking-[0.22em] text-(--color-muted-fg)">{date.weekday}</div>
                <div className="numeral text-3xl mt-0.5">{date.day}</div>
                <div className="text-[0.62rem] uppercase tracking-[0.16em] text-(--color-muted-fg) mt-0.5">{date.month}</div>
              </div>
            )}
            <div className="min-w-0 pt-1">
              <span className="text-xs uppercase tracking-[0.22em] text-(--color-muted-fg)">
                Program
              </span>
              <h1 className="font-display-tight text-3xl md:text-4xl mt-0.5 leading-tight">
                {date
                  ? `${date.weekday}, ${date.day} ${date.month} ${date.year}`
                  : 'Undated program'}
              </h1>
              {playlist.description && (
                <p className="text-sm text-(--color-muted-fg) mt-2 whitespace-pre-wrap max-w-prose">
                  {playlist.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            {playlist.items.length > 0 && (
              <Link
                href={`/playlists/${id}/play/0`}
                className="flex items-center gap-1.5 rounded-lg bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
              >
                <Play className="size-3.5" aria-hidden />
                Performance
              </Link>
            )}
            {canEditItems && (
              <Link
                href={`/playlists/${id}/edit`}
                className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm hover:border-(--color-accent)"
              >
                <Pencil className="size-3.5" aria-hidden />
                Edit
              </Link>
            )}
          </div>
        </div>

        {isAdmin && assignments.length > 0 && (
          <form action={handleNotify} className="flex items-center gap-2 mt-1">
            <input
              name="message"
              type="text"
              placeholder="Optional message to the rota…"
              maxLength={2000}
              className="flex-1 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm focus:border-(--color-accent) focus:outline-none"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm hover:border-(--color-accent) hover:text-(--color-accent)"
            >
              <Send className="size-3.5" aria-hidden />
              Notify rota
            </button>
          </form>
        )}
      </header>

      {/* Rota — read-only on the detail page. Editing is in /edit. */}
      <section className="grid gap-4 rounded-2xl border border-(--color-border) bg-(--color-muted)/30 p-5">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display text-xl flex items-baseline gap-2">
              <span className="numeral text-base">№</span>
              Service rota
            </h2>
            <p className="text-xs text-(--color-muted-fg) mt-0.5">
              {assignments.length} {assignments.length === 1 ? 'assignment' : 'assignments'}
              {isAdmin ? ' · open Edit to change' : ''}
            </p>
          </div>
        </header>
        <ul className="grid gap-1.5">
          {ROTA_ROLES.map((role) => {
            const filled = assignments.filter((a) => a.role === role);
            if (filled.length === 0) return null;
            return (
              <li
                key={role}
                className="grid grid-cols-[8rem_1fr] items-start gap-3 rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2"
              >
                <div className="text-sm font-medium pt-1">
                  {ROTA_ROLE_LABEL[role as RotaRole]}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {filled.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 rounded-full border border-(--color-border) bg-(--color-muted) px-2.5 py-1 text-xs"
                    >
                      {a.member_name}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
          {assignments.length === 0 && (
            <li className="text-sm text-(--color-muted-fg)">No one assigned yet.</li>
          )}
        </ul>
      </section>

      {/* Items list */}
      <section className="grid gap-3">
        <h2 className="font-display text-xl flex items-baseline gap-2">
          <span className="numeral text-base">№</span>
          Order of songs
        </h2>
        {playlist.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-(--color-border) p-6 text-sm text-(--color-muted-fg)">
            No songs in this program yet.
            {canEditItems && (
              <Link
                href={`/playlists/${id}/edit`}
                className="ml-1 text-(--color-accent) underline"
              >
                Add some →
              </Link>
            )}
          </p>
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
                    className="card-lift flex items-center gap-3 rounded-xl border border-(--color-border) px-4 py-3 hover:border-(--color-accent)"
                  >
                    <span className="numeral text-base w-7 shrink-0 text-right">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-base truncate">
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
      </section>
    </div>
  );
}
