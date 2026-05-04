import { describe, it, expect } from 'vitest';
import { generateInvitationToken, hashToken, verifyToken } from '../token';

describe('invitation tokens', () => {
  it('generates 32 bytes encoded as 43-char base64url', async () => {
    const t = generateInvitationToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes are unique per generation', async () => {
    const a = await hashToken(generateInvitationToken());
    const b = await hashToken(generateInvitationToken());
    expect(a).not.toBe(b);
  });

  it('verifyToken returns true for matching token+hash', async () => {
    const raw = generateInvitationToken();
    const hash = await hashToken(raw);
    expect(await verifyToken(raw, hash)).toBe(true);
  });

  it('verifyToken returns false for wrong token', async () => {
    const raw = generateInvitationToken();
    const hash = await hashToken(raw);
    const other = generateInvitationToken();
    expect(await verifyToken(other, hash)).toBe(false);
  });

  it('verifyToken returns false for malformed hash', async () => {
    expect(await verifyToken('anything', 'not-a-bcrypt-hash')).toBe(false);
  });
});
