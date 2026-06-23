import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeGetRotaCandidates } from '../service';

const ADMIN_ID = '00000000-0000-4000-a000-000000000001';
const adminSession = {
  user: { id: ADMIN_ID },
  profile: { id: ADMIN_ID, display_name: 'Admin', role: 'admin' as const, created_at: '' },
};

describe('getRotaCandidates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes through active profiles from the db layer (filter lives in wired wrapper)', async () => {
    const fetchActiveProfiles = vi.fn(async () => [
      { id: 'u1', display_name: 'Alice' },
    ]);
    const fetchCapabilities = vi.fn(async () => [
      { profile_id: 'u1', capability: 'guitar' as const },
    ]);
    const getCandidates = makeGetRotaCandidates({
      requireAdmin: async () => adminSession,
      db: { fetchActiveProfiles, fetchCapabilities },
    });

    const result = await getCandidates('some-playlist-id');
    expect(fetchActiveProfiles).toHaveBeenCalledOnce();
    expect(result).toEqual([
      { id: 'u1', display_name: 'Alice', capabilities: ['guitar'] },
    ]);
  });
});
