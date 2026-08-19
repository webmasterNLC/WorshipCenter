import Link from 'next/link';
import { ArrowLeft, ScrollText } from 'lucide-react';
import { listAuditLog, listSignInAttempts, AUDIT_PAGE_SIZE } from '@/server/actions/audit';

// Read-only by design: no forms, no server actions, no delete. The log is the
// record of what happened — an admin who could prune it would make it useless.

interface AdminAuditPageProps {
  searchParams: Promise<{ page?: string }>;
}

// Actions are namespaced "domain.verb" (song.update, invite.revoke, …), so the
// label comes out of the string itself — new actions need no map entry here.
function splitAction(action: string): { domain: string; verb: string } {
  const [domain = action, ...rest] = action.split('.');
  return { domain, verb: (rest.join('.') || domain).replace(/_/g, ' ') };
}

function formatMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const parts = Object.entries(metadata).map(
    ([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const { page: pageParam } = await searchParams;
  const [{ entries, page, hasMore }, signIns] = await Promise.all([
    listAuditLog(Number(pageParam ?? 0)),
    listSignInAttempts(),
  ]);

  return (
    <div className="grid gap-8 max-w-5xl">

      {/* Hero */}
      <header className="grid gap-2">
        <Link
          href="/admin/users"
          className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-(--color-muted-fg) hover:text-(--color-accent)"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Administration
        </Link>
        <h1 className="font-display-tight text-4xl md:text-5xl">
          Activity <em className="text-(--color-accent) not-italic">log</em>.
        </h1>
        <p className="text-sm text-(--color-muted-fg) max-w-prose">
          Every change made in WorshipCenter — who, what and when. Read-only: entries
          are written automatically and can never be edited or deleted.
        </p>
      </header>

      {/* Sign-ins live in auth_attempts, not audit_log — they happen before
          anyone is authenticated, so there is no actor to attribute them to. */}
      {signIns.length > 0 && page === 0 && (
        <section className="grid gap-3">
          <h2 className="font-display text-xl flex items-baseline gap-2">
            <span className="section-tick" aria-hidden />
            Recent sign-ins
          </h2>
          <ul className="grid gap-1.5">
            {signIns.map((s) => (
              <li
                key={s.id}
                className="grid gap-1 rounded-xl border border-(--color-border) px-4 py-2.5 md:grid-cols-[9.5rem_1fr_auto] md:items-baseline md:gap-4"
              >
                <time
                  dateTime={s.created_at}
                  className="text-xs tabular-nums text-(--color-muted-fg)"
                >
                  {new Date(s.created_at).toLocaleString()}
                </time>
                <span className="text-sm truncate">{s.email ?? 'unknown'}</span>
                <span className="flex items-baseline gap-2 text-xs">
                  {s.ip && (
                    <span className="tabular-nums text-(--color-muted-fg)">{s.ip}</span>
                  )}
                  <span
                    className={
                      s.succeeded
                        ? 'text-(--color-muted-fg)'
                        : 'font-medium text-(--color-danger)'
                    }
                  >
                    {s.succeeded ? 'signed in' : 'failed'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {page === 0 && (
        <h2 className="font-display text-xl flex items-baseline gap-2">
          <span className="section-tick" aria-hidden />
          Changes
        </h2>
      )}

      {entries.length === 0 ? (
        <div className="grid gap-2 justify-items-center rounded-2xl border border-dashed border-(--color-border) px-6 py-12 text-center">
          <ScrollText className="size-6 text-(--color-muted-fg)" aria-hidden />
          <p className="text-sm text-(--color-muted-fg)">
            {page === 0 ? 'Nothing has been recorded yet.' : 'No older entries.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-1.5">
          {entries.map((e) => {
            const { domain, verb } = splitAction(e.action);
            const meta = formatMetadata(e.metadata);
            return (
              <li
                key={e.id}
                className="grid gap-1 rounded-xl border border-(--color-border) px-4 py-3 md:grid-cols-[9.5rem_1fr] md:items-baseline md:gap-4"
              >
                <time
                  dateTime={e.created_at}
                  className="text-xs tabular-nums text-(--color-muted-fg)"
                >
                  {new Date(e.created_at).toLocaleString()}
                </time>
                <div className="min-w-0 grid gap-0.5">
                  <p className="text-sm flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{e.actor_name}</span>
                    <span className="rounded-md bg-(--color-muted) px-1.5 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] text-(--color-muted-fg)">
                      {domain}
                    </span>
                    <span className="text-(--color-fg)">{verb}</span>
                    {e.target_label && (
                      <span className="text-(--color-muted-fg)">
                        &rarr; <span className="text-(--color-fg)">{e.target_label}</span>
                      </span>
                    )}
                  </p>
                  {meta && (
                    <p className="text-xs text-(--color-muted-fg) break-words">{meta}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(page > 0 || hasMore) && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 0 ? (
            <Link
              href={`/admin/audit?page=${page - 1}`}
              className="rounded-lg border border-(--color-border) px-3 py-2 hover:border-(--color-accent) hover:text-(--color-accent)"
            >
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs uppercase tracking-[0.16em] text-(--color-muted-fg)">
            {page * AUDIT_PAGE_SIZE + 1}–{page * AUDIT_PAGE_SIZE + entries.length}
          </span>
          {hasMore ? (
            <Link
              href={`/admin/audit?page=${page + 1}`}
              className="rounded-lg border border-(--color-border) px-3 py-2 hover:border-(--color-accent) hover:text-(--color-accent)"
            >
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
