import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/server/auth/errors';
import { makeCreatePlaylist } from '../playlists';

const adminSession = {
  user: { id: 'admin-uid' },
  profile: { id: 'admin-uid', display_name: 'Admin', role: 'admin' as const, created_at: '' },
};

function makeFakes() {
  const inserted: Array<Record<string, unknown>> = [];
  const writeAudit = vi.fn(async () => {});
  const db = {
    insertPlaylist: vi.fn(async (row: Record<string, unknown>) => {
      inserted.push(row);
      return { id: 'pl1' };
    }),
    writeAudit,
  };
  return { db, inserted };
}

describe('createPlaylist', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Forbidden when caller is not admin', async () => {
    const { db } = makeFakes();
    const action = makeCreatePlaylist({
      requireAdmin: async () => { throw new ForbiddenError(); },
      db,
    });
    await expect(action({})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('inserts program with owner_id + writes audit', async () => {
    const { db, inserted } = makeFakes();
    const action = makeCreatePlaylist({
      requireAdmin: async () => adminSession,
      db,
    });
    const result = await action({
      scheduled_for: '2026-05-04',
      description: 'Morning service notes',
    });
    expect(result.id).toBe('pl1');
    expect(inserted[0]?.owner_id).toBe('admin-uid');
    expect(inserted[0]?.scheduled_for).toBe('2026-05-04');
    expect(db.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'playlist.create',
        actorId: 'admin-uid',
        targetId: 'pl1',
      }),
    );
  });

  it('throws Validation when scheduled_for is not a valid date string', async () => {
    const { db } = makeFakes();
    const action = makeCreatePlaylist({
      requireAdmin: async () => adminSession,
      db,
    });
    await expect(
      action({ scheduled_for: 'not-a-date' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
