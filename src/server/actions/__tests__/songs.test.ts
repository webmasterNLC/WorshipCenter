import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/server/auth/errors';
import { makeCreateSong, type CreateSongDeps } from '../songs';

const adminSession = {
  user: { id: 'admin-uid' },
  profile: { id: 'admin-uid', display_name: 'A', role: 'admin' as const, created_at: '' },
};

type InsertedSongRow = Parameters<CreateSongDeps['db']['insertSong']>[0];
type InsertedTranslationRow = Parameters<CreateSongDeps['db']['insertTranslations']>[0][number];

function makeFakes() {
  const insertedSongs: InsertedSongRow[] = [];
  const insertedTranslations: InsertedTranslationRow[] = [];
  const writeAudit = vi.fn(async () => {});
  const db: CreateSongDeps['db'] = {
    insertSong: vi.fn(async (row: InsertedSongRow) => {
      insertedSongs.push(row);
      return { id: 's1' };
    }),
    insertTranslations: vi.fn(async (rows: InsertedTranslationRow[]) => {
      insertedTranslations.push(...rows);
    }),
    writeAudit,
  };
  return { db, insertedSongs, insertedTranslations };
}

describe('createSong', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Forbidden when caller is not admin', async () => {
    const { db } = makeFakes();
    const action = makeCreateSong({
      requireAdmin: async () => { throw new ForbiddenError(); },
      db,
    });
    await expect(
      action({
        original_key: 'G',
        translations: [
          { language: 'en', title: 't', body_chordpro: '[G]hi', is_primary: true },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws Validation on bad key', async () => {
    const { db } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => adminSession, db });
    await expect(
      action({
        original_key: 'INVALID',
        translations: [
          { language: 'en', title: 't', body_chordpro: '[G]hi', is_primary: true },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws Validation when no translation is primary', async () => {
    const { db } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => adminSession, db });
    await expect(
      action({
        original_key: 'G',
        translations: [
          { language: 'en', title: 't', body_chordpro: '[G]hi', is_primary: false },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws Validation when two translations claim primary', async () => {
    const { db } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => adminSession, db });
    await expect(
      action({
        original_key: 'G',
        translations: [
          { language: 'en', title: 't', body_chordpro: '[G]hi', is_primary: true },
          { language: 'de', title: 'T', body_chordpro: '[G]hi', is_primary: true },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws Validation on duplicate language', async () => {
    const { db } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => adminSession, db });
    await expect(
      action({
        original_key: 'G',
        translations: [
          { language: 'en', title: 't', body_chordpro: '[G]hi', is_primary: true },
          { language: 'en', title: 'u', body_chordpro: '[G]hi', is_primary: false },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts song with primary fields cached + translations + audit', async () => {
    const { db, insertedSongs, insertedTranslations } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => adminSession, db });
    const result = await action({
      original_key: 'G',
      tags: ['hymn'],
      translations: [
        { language: 'en', title: 'Amazing Grace', body_chordpro: '[G]Amazing', is_primary: true },
        { language: 'de', title: 'Erstaunliche Gnade', body_chordpro: '[G]Erstaunlich', is_primary: false },
      ],
    });
    expect(result.id).toBe('s1');
    // Songs row gets the primary translation as cache
    expect(insertedSongs[0]).toMatchObject({
      title: 'Amazing Grace',
      language: 'en',
      body_chordpro: '[G]Amazing',
      original_key: 'G',
      created_by: 'admin-uid',
    });
    // Both translations land in song_translations
    expect(insertedTranslations).toHaveLength(2);
    expect(insertedTranslations[0]).toMatchObject({ song_id: 's1', language: 'en', is_primary: true });
    expect(insertedTranslations[1]).toMatchObject({ song_id: 's1', language: 'de', is_primary: false });
    expect(db.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'song.create',
        actorId: 'admin-uid',
        targetId: 's1',
      }),
    );
  });
});
