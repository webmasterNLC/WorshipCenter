import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/server/auth/errors';
import { makeCreateSong } from '../songs';

const adminSession = {
  user: { id: 'admin-uid' },
  profile: { id: 'admin-uid', display_name: 'A', role: 'admin' as const, created_at: '' },
};

function makeFakes() {
  const inserted: Array<Record<string, unknown>> = [];
  const writeAudit = vi.fn(async () => {});
  const db = {
    insert: vi.fn(async (row: Record<string, unknown>) => { inserted.push(row); return { id: 's1', ...row }; }),
    writeAudit,
  };
  return { db, inserted };
}

describe('createSong', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Forbidden when caller is not admin', async () => {
    const { db } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => { throw new ForbiddenError(); }, db });
    await expect(action({
      title: 't', language: 'en', original_key: 'G', body_chordpro: '[G]hi',
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws Validation on bad key', async () => {
    const { db } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => adminSession, db });
    await expect(action({
      title: 't', language: 'en', original_key: 'INVALID', body_chordpro: '[G]hi',
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts song with created_by + writes audit', async () => {
    const { db, inserted } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => adminSession, db });
    const result = await action({
      title: 'Amazing Grace', language: 'en', original_key: 'G',
      body_chordpro: '[G]Amazing', tags: ['hymn'],
    });
    expect(result.id).toBe('s1');
    expect(inserted[0]?.created_by).toBe('admin-uid');
    expect(db.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'song.create', actorId: 'admin-uid', targetId: 's1',
    }));
  });
});
