import { describe, it, expect, vi } from 'vitest';
import { ForbiddenError } from '@/server/auth/errors';
import { makeListAuditLog, AUDIT_PAGE_SIZE, type AuditRow } from '../audit';

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
      db: { fetchPage: async () => mixed },
    })(0);
    expect(page.entries.map((e) => e.actor_name)).toEqual([
      'Object form',
      'Array form',
      'Unknown',
    ]);
  });
});
