import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/server/auth/errors';

// We test the pure logic by using makeSendInvitation, which takes its
// dependencies (auth gate, db, mailer, token funcs) as arguments.

import { makeSendInvitation } from '../invitations';

const adminSession = {
  user: { id: 'admin-uid' },
  profile: { id: 'admin-uid', display_name: 'Admin', role: 'admin' as const, created_at: '' },
};

function makeFakes() {
  const insertedRows: Record<string, unknown>[] = [];
  const sentMails: Record<string, unknown>[] = [];

  const db = {
    insertInvitation: vi.fn(async (row: Record<string, unknown>) => {
      insertedRows.push(row);
      return { id: 'inv-1', ...row };
    }),
    writeAudit: vi.fn(async () => {}),
  };
  const mailer = { send: vi.fn(async (msg: Record<string, unknown>) => { sentMails.push(msg); return { messageId: '<id>' }; }) };
  const tokens = {
    generate: vi.fn(() => 'RAWTOKEN'),
    hash: vi.fn(async (raw: string) => `hash(${raw})`),
  };
  return { db, mailer, tokens, insertedRows, sentMails };
}

describe('sendInvitation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ForbiddenError if caller is not admin', async () => {
    const { db, mailer, tokens } = makeFakes();
    const action = makeSendInvitation({
      requireAdmin: async () => { throw new ForbiddenError(); },
      db, mailer, tokens, originUrl: 'https://x.test',
    });
    await expect(action({ email: 'x@y.org', role: 'musician' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError on invalid email', async () => {
    const { db, mailer, tokens } = makeFakes();
    const action = makeSendInvitation({
      requireAdmin: async () => adminSession,
      db, mailer, tokens, originUrl: 'https://x.test',
    });
    await expect(action({ email: 'not-an-email', role: 'musician' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts hashed token, sends email with raw token, writes audit', async () => {
    const { db, mailer, tokens, insertedRows, sentMails } = makeFakes();
    const action = makeSendInvitation({
      requireAdmin: async () => adminSession,
      db, mailer, tokens, originUrl: 'https://x.test',
    });
    await action({ email: 'New@Example.org', role: 'leader' });

    expect(tokens.generate).toHaveBeenCalled();
    expect(tokens.hash).toHaveBeenCalledWith('RAWTOKEN');

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]!.email).toBe('new@example.org'); // lowercased
    expect(insertedRows[0]!.role).toBe('leader');
    expect(insertedRows[0]!.invited_by).toBe('admin-uid');
    expect(insertedRows[0]!.token_hash).toBe('hash(RAWTOKEN)');
    expect(insertedRows[0]!.expires_at).toBeInstanceOf(Date);

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0]!.to).toBe('new@example.org');
    expect(sentMails[0]!.html).toContain('https://x.test/api/invitations/accept?token=RAWTOKEN');
    expect(sentMails[0]!.text).toContain('https://x.test/api/invitations/accept?token=RAWTOKEN');

    expect(db.writeAudit).toHaveBeenCalledWith({
      actorId: 'admin-uid',
      action: 'invite.send',
      targetType: 'invitation',
      targetId: 'inv-1',
      metadata: { email: 'new@example.org', role: 'leader' },
    });
  });
});
