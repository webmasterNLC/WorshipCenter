import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/server/auth/errors';
import { makeAdminDisableUser } from '../profile';

const ADMIN_ID = '00000000-0000-4000-a000-000000000001';
const adminSession = {
  user: { id: ADMIN_ID },
  profile: { id: ADMIN_ID, display_name: 'Admin', role: 'admin' as const, created_at: '' },
};

function makeFakes(opts?: {
  targetRole?: 'admin' | 'leader' | 'viewer';
  activeAdminCount?: number;
  futurePlaylistIds?: string[];
}) {
  const bans: Array<{ user_id: string; ban_duration: string }> = [];
  const profileUpdates: Array<{ id: string; disabled_at: string }> = [];
  const assignmentDeletes: Array<{ member_id: string; playlist_ids: string[] }> = [];
  const audits: Array<Record<string, unknown>> = [];

  const db = {
    getProfileRole: vi.fn(async (_id: string) => opts?.targetRole ?? 'viewer'),
    countActiveAdmins: vi.fn(async () => opts?.activeAdminCount ?? 2),
    banUser: vi.fn(async (user_id: string, ban_duration: string) => {
      bans.push({ user_id, ban_duration });
    }),
    markProfileDisabled: vi.fn(async (id: string, disabled_at: string) => {
      profileUpdates.push({ id, disabled_at });
    }),
    futurePlaylistIds: vi.fn(async () => opts?.futurePlaylistIds ?? ['pl-1', 'pl-2']),
    deleteAssignments: vi.fn(async (member_id: string, playlist_ids: string[]) => {
      assignmentDeletes.push({ member_id, playlist_ids });
    }),
    writeAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
  };

  return { db, bans, profileUpdates, assignmentDeletes, audits };
}

describe('adminDisableUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bans, marks disabled, clears future rota, writes audit', async () => {
    const { db, bans, profileUpdates, assignmentDeletes, audits } = makeFakes();
    const action = makeAdminDisableUser({
      requireAdmin: async () => adminSession,
      db,
    });

    const TARGET = '550e8400-e29b-41d4-a716-446655440000';
    await action({ user_id: TARGET });

    expect(bans).toEqual([{ user_id: TARGET, ban_duration: '876000h' }]);
    expect(profileUpdates).toHaveLength(1);
    expect(profileUpdates[0]!.id).toBe(TARGET);
    expect(profileUpdates[0]!.disabled_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(assignmentDeletes).toEqual([
      { member_id: TARGET, playlist_ids: ['pl-1', 'pl-2'] },
    ]);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: ADMIN_ID,
      action: 'profile.disabled',
      targetType: 'profile',
      targetId: TARGET,
    });
  });

  it('throws ValidationError when admin tries to disable themselves', async () => {
    const { db } = makeFakes();
    const action = makeAdminDisableUser({
      requireAdmin: async () => adminSession,
      db,
    });

    await expect(action({ user_id: ADMIN_ID }))
      .rejects.toBeInstanceOf(ValidationError);

    expect(db.banUser).not.toHaveBeenCalled();
    expect(db.markProfileDisabled).not.toHaveBeenCalled();
  });
});
