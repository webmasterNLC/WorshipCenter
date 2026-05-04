import { describe, it, expect } from 'vitest';
import { UnauthorizedError, ForbiddenError } from '../errors';

// We're testing the pure logic of requireRole given a profile loader.
// The Supabase calls are abstracted via the loader injected at construction.

import { makeRequireRole } from '../require';

describe('makeRequireRole', () => {
  it('throws UnauthorizedError when no user', async () => {
    const requireRole = makeRequireRole({
      loadSession: async () => null,
    });
    await expect(requireRole('admin')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ForbiddenError when user has wrong role', async () => {
    const requireRole = makeRequireRole({
      loadSession: async () => ({
        user: { id: 'u1' },
        profile: { id: 'u1', display_name: 'M', role: 'musician' as const, created_at: '' },
      }),
    });
    await expect(requireRole('admin')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns session when role matches one of allowed', async () => {
    const session = {
      user: { id: 'u1' },
      profile: { id: 'u1', display_name: 'L', role: 'leader' as const, created_at: '' },
    };
    const requireRole = makeRequireRole({ loadSession: async () => session });
    const out = await requireRole('admin', 'leader');
    expect(out).toEqual(session);
  });

  it('throws ForbiddenError when allowed list is empty', async () => {
    const requireRole = makeRequireRole({
      loadSession: async () => ({
        user: { id: 'u1' },
        profile: { id: 'u1', display_name: 'A', role: 'admin' as const, created_at: '' },
      }),
    });
    // @ts-expect-error: testing runtime behavior with no roles
    await expect(requireRole()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
