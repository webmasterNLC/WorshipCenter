// Read-only view onto audit_log.
//
// There is deliberately NO delete or update path here: audit_log has no client
// DELETE/UPDATE policy (RLS is default-deny), and nothing in the app issues one.
// Rows are appended by write_audit() and never removed.
import 'server-only';
import { requireRole, type Session } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const AUDIT_PAGE_SIZE = 50;

export interface AuditEntry {
  id: number;
  created_at: string;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditPage {
  entries: AuditEntry[];
  page: number;
  hasMore: boolean;
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
  };
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
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}

export function makeListAuditLog(deps: ListAuditLogDeps) {
  return async function listAuditLog(page = 0): Promise<AuditPage> {
    await deps.requireAdmin();
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
    // One row past the page tells us whether an older page exists, without a count().
    const rows = await deps.db.fetchPage(safePage * AUDIT_PAGE_SIZE, AUDIT_PAGE_SIZE + 1);
    return {
      page: safePage,
      hasMore: rows.length > AUDIT_PAGE_SIZE,
      entries: rows.slice(0, AUDIT_PAGE_SIZE).map(toEntry),
    };
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
    },
  })(page);
}
