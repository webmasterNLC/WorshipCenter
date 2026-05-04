import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMailer } from '../transport';

const sendMail = vi.fn();

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
  createTransport: () => ({ sendMail }),
}));

describe('makeMailer', () => {
  beforeEach(() => sendMail.mockReset());

  it('sends an email through the SMTP transport with from/to/subject/html/text', async () => {
    sendMail.mockResolvedValueOnce({ messageId: '<id1>' });
    const mailer = makeMailer({
      host: 'smtp.example.org', port: 587, secure: false,
      user: 'u', password: 'p', from: 'NLC <noreply@example.org>',
    });
    const result = await mailer.send({
      to: 'a@example.org',
      subject: 'Hello',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(sendMail).toHaveBeenCalledOnce();
    const arg = sendMail.mock.calls[0][0];
    expect(arg.from).toBe('NLC <noreply@example.org>');
    expect(arg.to).toBe('a@example.org');
    expect(arg.subject).toBe('Hello');
    expect(arg.html).toBe('<p>hi</p>');
    expect(arg.text).toBe('hi');
    expect(result.messageId).toBe('<id1>');
  });

  it('rethrows transport errors as Error', async () => {
    sendMail.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const mailer = makeMailer({
      host: 'smtp.example.org', port: 587, secure: false,
      user: 'u', password: 'p', from: 'NLC <x@y>',
    });
    await expect(
      mailer.send({ to: 'a@b', subject: 's', html: 'h', text: 't' }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
