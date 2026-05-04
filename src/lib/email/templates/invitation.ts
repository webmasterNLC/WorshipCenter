import 'server-only';

export interface InvitationEmailInput {
  acceptUrl: string;
  inviterName: string;
  role: 'admin' | 'leader' | 'musician';
  expiresAt: Date;
}

export function renderInvitationEmail(input: InvitationEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { acceptUrl, inviterName, role, expiresAt } = input;
  const expiry = expiresAt.toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });

  const subject = `You're invited to NLC Burgdorf SongDrop`;

  const text = [
    `Hello,`,
    ``,
    `${inviterName} invited you to NLC Burgdorf SongDrop as a ${role}.`,
    ``,
    `Open this link to accept the invitation and set up your account:`,
    `${acceptUrl}`,
    ``,
    `This link expires on ${expiry}. It can only be used once.`,
    ``,
    `If you weren't expecting this email, you can ignore it.`,
    ``,
    `— NLC Burgdorf SongDrop`,
  ].join('\n');

  const html = `
<!doctype html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a">
  <h2 style="margin:0 0 16px">You're invited to NLC Burgdorf SongDrop</h2>
  <p><strong>${escape(inviterName)}</strong> invited you as a <strong>${escape(role)}</strong>.</p>
  <p>
    <a href="${escape(acceptUrl)}" style="display:inline-block;background:#b45309;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Accept invitation</a>
  </p>
  <p style="color:#475569;font-size:14px">This link expires on ${escape(expiry)} and can only be used once.</p>
  <p style="color:#475569;font-size:14px">If you weren't expecting this email, you can ignore it.</p>
</body></html>
`.trim();

  return { subject, html, text };
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
