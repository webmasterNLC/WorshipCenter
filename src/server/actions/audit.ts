// Read-only view onto audit_log.
//
// There is deliberately NO delete or update path here: audit_log has no client
// DELETE/UPDATE policy (RLS is default-deny), and nothing in the app issues one.
// Rows are appended by write_audit() and never removed.
import 'server-only';
import { requireRole, type Session } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const AUDIT_PAGE_SIZE = 50;

/**
 * Where a target_id resolves to something a human recognises. audit_log stores
 * bare UUIDs, so "capability.grant · profile · <uuid>" is unreadable without
 * this. Rows deleted since have no label — their name lives on in the metadata
 * the delete action recorded.
 */
export const TARGET_SOURCES = {
  profile: { table: 'profiles', column: 'display_name' },
  song: { table: 'songs', column: 'title' },
  playlist: { table: 'playlists', column: 'scheduled_for' },
  invitation: { table: 'invitations', column: 'email' },
} as const;

export type TargetType = keyof typeof TARGET_SOURCES;

export interface AuditEntry {
  id: number;
  created_at: string;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  /** Human name of the target, or null if unresolvable (deleted, or unknown type). */
  target_label: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditPage {
  entries: AuditEntry[];
  page: number;
  hasMore: boolean;
}

export interface SignInAttempt {
  id: number;
  created_at: string;
  email: string | null;
  ip: string | null;
  succeeded: boolean;
}

/** Raw shape as PostgREST returns it, before the embed is unwrapped. */
export interface AuditRow {
  id: number;
  created_at: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: unknown;
  actor: { display_name: string } | Array<{ display_name: string }> | null;
}

export interface ListAuditLogDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    fetchPage(offset: number, limit: number): Promise<AuditRow[]>;
    /** id → label for one target type. Missing ids simply don't come back. */
    fetchLabels(
      table: string,
      column: string,
      ids: string[],
    ): Promise<Array<{ id: string; label: string | null }>>;
  };
}

function isTargetType(t: string | null): t is TargetType {
  return t !== null && t in TARGET_SOURCES;
}

function toEntry(row: AuditRow): AuditEntry {
  const a = row.actor;
  const actor = Array.isArray(a) ? a[0] : a;
  return {
    id: row.id,
    created_at: row.created_at,
    actor_name: actor?.display_name ?? 'Unknown',
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    target_label: null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}

/** One lookup per target type present on the page — at most four, usually one or two. */
async function resolveTargetLabels(
  entries: AuditEntry[],
  db: ListAuditLogDeps['db'],
): Promise<void> {
  const idsByType = new Map<TargetType, Set<string>>();
  for (const e of entries) {
    if (!isTargetType(e.target_type) || !e.target_id) continue;
    const set = idsByType.get(e.target_type) ?? new Set<string>();
    set.add(e.target_id);
    idsByType.set(e.target_type, set);
  }

  const lookups = await Promise.all(
    [...idsByType].map(async ([type, ids]) => {
      const { table, column } = TARGET_SOURCES[type];
      const rows = await db.fetchLabels(table, column, [...ids]);
      return [type, new Map(rows.map((r) => [r.id, r.label]))] as const;
    }),
  );
  const byType = new Map(lookups);

  for (const e of entries) {
    if (!isTargetType(e.target_type) || !e.target_id) continue;
    e.target_label = byType.get(e.target_type)?.get(e.target_id) ?? null;
  }
}

export function makeListAuditLog(deps: ListAuditLogDeps) {
  return async function listAuditLog(page = 0): Promise<AuditPage> {
    await deps.requireAdmin();
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
    // One row past the page tells us whether an older page exists, without a count().
    const rows = await deps.db.fetchPage(safePage * AUDIT_PAGE_SIZE, AUDIT_PAGE_SIZE + 1);
    const entries = rows.slice(0, AUDIT_PAGE_SIZE).map(toEntry);
    await resolveTargetLabels(entries, deps.db);
    return { page: safePage, hasMore: rows.length > AUDIT_PAGE_SIZE, entries };
  };
}

export async function listAuditLog(page = 0): Promise<AuditPage> {
  return makeListAuditLog({
    requireAdmin: () => requireRole('admin'),
    db: {
      // The caller's own client, so the "audit_log: admin reads" RLS policy is
      // the second gate behind requireAdmin — no service role key involved.
      async fetchPage(offset, limit) {
        const sb = await createSupabaseServerClient();
        const { data, error } = await sb
          .from('audit_log')
          .select(
            'id, created_at, action, target_type, target_id, metadata, actor:profiles!actor_id(display_name)',
          )
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as AuditRow[];
      },
      async fetchLabels(table, column, ids) {
        const sb = await createSupabaseServerClient();
        // The column is interpolated, so supabase-js can't infer the row shape
        // from the select string — .returns<>() states it instead. `table` and
        // `column` come from TARGET_SOURCES, never from user input.
        const { data, error } = await sb
          .from(table)
          .select(`id, ${column}`)
          .in('id', ids)
          .returns<Array<Record<string, unknown>>>();
        if (error) throw new Error(error.message);
        return (data ?? []).map((row) => {
          const value = row[column];
          return { id: String(row.id), label: value == null ? null : String(value) };
        });
      },
    },
  })(page);
}

/**
 * Recent sign-in attempts, successful and failed. Separate from audit_log:
 * these are written by recordAuthAttempt() before anyone is authenticated, so
 * there is no actor to attribute them to — only an email and an IP.
 */
export async function listSignInAttempts(limit = 20): Promise<SignInAttempt[]> {
  await requireRole('admin');
  // Reads via the caller's client, so "auth_attempts: admin reads" applies.
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from('auth_attempts')
    .select('id, created_at, email, ip, succeeded')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SignInAttempt[];
}
