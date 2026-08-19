import { describe, it, expect, vi } from 'vitest';
import { ForbiddenError } from '@/server/auth/errors';
import { makeListAuditLog, AUDIT_PAGE_SIZE, type AuditRow } from '../audit';

const noLabels = { fetchLabels: async () => [] };

const adminSession = {
  user: { id: 'admin-uid' },
  profile: { id: 'admin-uid', display_name: 'Admin', role: 'admin' as const, created_at: '' },
};

function rows(n: number): AuditRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    created_at: '2026-08-19T10:00:00Z',
    action: 'song.update',
    target_type: 'song',
    target_id: 's1',
    metadata: { title: 'Arriba' },
    actor: { display_name: 'Nehemiah' },
  }));
}

function makeDb(available: number) {
  return {
    fetchPage: vi.fn(async (offset: number, limit: number) =>
      rows(Math.max(0, Math.min(limit, available - offset))),
    ),
    ...noLabels,
  };
}

describe('listAuditLog', () => {
  it('throws ForbiddenError for non-admins', async () => {
    const action = makeListAuditLog({
      requireAdmin: async () => {
        throw new ForbiddenError();
      },
      db: makeDb(10),
    });
    await expect(action(0)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns one page and reports more when the lookahead row exists', async () => {
    const db = makeDb(AUDIT_PAGE_SIZE * 3);
    const page = await makeListAuditLog({ requireAdmin: async () => adminSession, db })(1);
    expect(db.fetchPage).toHaveBeenCalledWith(AUDIT_PAGE_SIZE, AUDIT_PAGE_SIZE + 1);
    expect(page.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(page.page).toBe(1);
    expect(page.hasMore).toBe(true);
  });

  it('reports no more when the last page is short', async () => {
    const page = await makeListAuditLog({
      requireAdmin: async () => adminSession,
      db: makeDb(AUDIT_PAGE_SIZE),
    })(0);
    expect(page.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(page.hasMore).toBe(false);
  });

  it('clamps junk page numbers to the first page', async () => {
    const db = makeDb(10);
    const action = makeListAuditLog({ requireAdmin: async () => adminSession, db });
    for (const bad of [-3, NaN, 1.7]) {
      await action(bad);
    }
    expect(db.fetchPage.mock.calls.map((c) => c[0])).toEqual([0, 0, AUDIT_PAGE_SIZE]);
  });

  it('unwraps the actor embed whether PostgREST returns an object or an array', async () => {
    const [base] = rows(1);
    const mixed: AuditRow[] = [
      { ...base!, actor: { display_name: 'Object form' } },
      { ...base!, id: 2, actor: [{ display_name: 'Array form' }] },
      { ...base!, id: 3, actor: null },
    ];
    const page = await makeListAuditLog({
      requireAdmin: async () => adminSession,
      db: { fetchPage: async () => mixed, ...noLabels },
    })(0);
    expect(page.entries.map((e) => e.actor_name)).toEqual([
      'Object form',
      'Array form',
      'Unknown',
    ]);
  });

  it('resolves target ids to names, one lookup per target type', async () => {
    const [base] = rows(1);
    const page = await makeListAuditLog({
      requireAdmin: async () => adminSession,
      db: {
        fetchPage: async () => [
          { ...base!, id: 1, action: 'capability.grant', target_type: 'profile', target_id: 'p1' },
          { ...base!, id: 2, action: 'profile.role_change', target_type: 'profile', target_id: 'p2' },
          { ...base!, id: 3, action: 'song.update', target_type: 'song', target_id: 's1' },
          // deleted since, and an unknown type: both stay unlabelled
          { ...base!, id: 4, action: 'song.delete', target_type: 'song', target_id: 'gone' },
          { ...base!, id: 5, action: 'rota.assign', target_type: 'rota', target_id: 'r1' },
        ],
        fetchLabels: vi.fn(async (table: string, _column: string, ids: string[]) => {
          const names: Record<string, string> = {
            p1: 'Nehemiah',
            p2: 'Admin NLC',
            s1: 'Arriba',
          };
          expect(table === 'profiles' ? ids.sort() : ids).toEqual(
            table === 'profiles' ? ['p1', 'p2'] : ['s1', 'gone'],
          );
          return ids.flatMap((id) => (names[id] ? [{ id, label: names[id]! }] : []));
        }),
      },
    })(0);

    expect(page.entries.map((e) => e.target_label)).toEqual([
      'Nehemiah',
      'Admin NLC',
      'Arriba',
      null,
      null,
    ]);
  });
});
