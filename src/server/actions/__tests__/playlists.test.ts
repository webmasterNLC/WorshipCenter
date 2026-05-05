import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/server/auth/errors';
import { makeCreatePlaylist } from '../playlists';

const leaderSession = {
  user: { id: 'leader-uid' },
  profile: { id: 'leader-uid', display_name: 'Band Leader', role: 'leader' as const, created_at: '' },
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

  it('throws Forbidden when caller is not leader or admin', async () => {
    const { db } = makeFakes();
    const action = makeCreatePlaylist({
      requireLeaderOrAdmin: async () => { throw new ForbiddenError(); },
      db,
    });
    await expect(action({ name: 'Sunday service' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws Validation when name is empty', async () => {
    const { db } = makeFakes();
    const action = makeCreatePlaylist({
      requireLeaderOrAdmin: async () => leaderSession,
      db,
    });
    await expect(action({ name: '' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts playlist with owner_id + writes audit', async () => {
    const { db, inserted } = makeFakes();
    const action = makeCreatePlaylist({
      requireLeaderOrAdmin: async () => leaderSession,
      db,
    });
    const result = await action({
      name: 'Sunday 2026-05-04',
      scheduled_for: '2026-05-04',
      description: 'Morning service setlist',
    });
    expect(result.id).toBe('pl1');
    expect(inserted[0]?.owner_id).toBe('leader-uid');
    expect(inserted[0]?.name).toBe('Sunday 2026-05-04');
    expect(db.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'playlist.create',
        actorId: 'leader-uid',
        targetId: 'pl1',
      }),
    );
  });

  it('throws Validation when scheduled_for is not a valid date string', async () => {
    const { db } = makeFakes();
    const action = makeCreatePlaylist({
      requireLeaderOrAdmin: async () => leaderSession,
      db,
    });
    await expect(
      action({ name: 'Bad date', scheduled_for: 'not-a-date' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
