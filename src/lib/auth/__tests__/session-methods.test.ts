import { describe, it, expect } from 'vitest';

import { sessionAuthMethods, usedPassword } from '../session-methods';

type Sb = Parameters<typeof sessionAuthMethods>[0];

function clientReturning(currentAuthenticationMethods: unknown) {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentAuthenticationMethods },
        }),
      },
    },
  } as unknown as Sb;
}

describe('sessionAuthMethods', () => {
  it('reads the RFC-8176 string form', async () => {
    expect(await sessionAuthMethods(clientReturning(['password']))).toEqual(['password']);
  });

  it('reads the detailed AMREntry form', async () => {
    const sb = clientReturning([{ method: 'otp', timestamp: 1 }]);
    expect(await sessionAuthMethods(sb)).toEqual(['otp']);
  });

  it('returns [] when the claim is absent', async () => {
    expect(await sessionAuthMethods(clientReturning(undefined))).toEqual([]);
  });
});

describe('usedPassword', () => {
  it('flags password sessions — these must re-enter the old password', () => {
    expect(usedPassword(['password'])).toBe(true);
    expect(usedPassword(['password', 'totp'])).toBe(true);
  });

  it('clears sessions that proved inbox access instead', () => {
    expect(usedPassword(['otp'])).toBe(false);
    expect(usedPassword(['magiclink'])).toBe(false);
  });

  it('fails open on an absent claim rather than dead-ending recovery', () => {
    expect(usedPassword([])).toBe(false);
  });
});
