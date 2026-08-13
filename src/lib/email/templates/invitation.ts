import 'server-only';

import { EMAIL_LOGO_CID, emailLogoAttachment } from '@/lib/email/logo';
import type { EmailAttachment } from '@/lib/email/transport';

export interface InvitationEmailInput {
  acceptUrl: string;
  inviterName: string;
  role: 'admin' | 'leader' | 'viewer';
  expiresAt: Date;
}

export function renderInvitationEmail(input: InvitationEmailInput): {
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
} {
  const { acceptUrl, inviterName, role, expiresAt } = input;
  // en-GB, not en-US: day-month-year matches what a Swiss reader expects.
  const expiry = expiresAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const roleLabel = { admin: 'Administrator', leader: 'Worship Leader', viewer: 'Member' }[role];

  const subject = `Invitation to NLC Burgdorf WorshipCenter`;

  const text = [
    `Hi,`,
    ``,
    `${inviterName} invited you to NLC Burgdorf WorshipCenter as ${roleLabel}.`,
    ``,
    `Open this link to accept the invitation and set up your account:`,
    `${acceptUrl}`,
    ``,
    `The link expires on ${expiry} and can only be used once.`,
    ``,
    `If you weren't expecting this email, you can ignore it.`,
    ``,
    `— NLC Burgdorf WorshipCenter`,
  ].join('\n');

  // Logo travels with the message as an inline attachment instead of being
  // fetched from the app. Two reasons: remote images sit behind the client's
  // "load images?" prompt, and a data: URI — the obvious alternative — is
  // stripped outright by Gmail and Outlook. cid: is what both render.
  const html = `
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;margin:0;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;">
      <tr><td align="center" style="padding:32px 32px 20px 32px;border-bottom:2px solid #1F3A60;">
        <img src="cid:${EMAIL_LOGO_CID}" width="58" height="59" alt="NLC Burgdorf" style="display:block;margin:0 auto 10px auto;border:0;outline:none;">
        <span style="color:#1F3A60;font-size:13px;font-weight:bold;letter-spacing:4px;text-transform:uppercase;">WorshipCenter</span>
      </td></tr>
      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.2;color:#16181d;letter-spacing:-0.01em;">You're invited</h1>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#6b6b6b;">
          <strong style="color:#16181d;">${escape(inviterName)}</strong> invited you to NLC Burgdorf WorshipCenter as <strong style="color:#16181d;">${escape(roleLabel)}</strong>. Accept the invitation to set up your account.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
          <tr><td bgcolor="#1F3A60" style="border-radius:8px;">
            <a href="${escape(acceptUrl)}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Accept invitation</a>
          </td></tr>
        </table>
        <p style="margin:0 0 6px 0;font-size:12px;color:#9a9a9a;">If the button doesn't work, copy this link:</p>
        <p style="margin:0 0 8px 0;font-size:12px;word-break:break-all;"><a href="${escape(acceptUrl)}" style="color:#1F3A60;">${escape(acceptUrl)}</a></p>
        <p style="margin:16px 0 0 0;font-size:13px;color:#6b6b6b;">The link expires on ${escape(expiry)} and can only be used once.</p>
      </td></tr>
      <tr><td style="border-top:1px solid #e5e5e5;padding:20px 32px;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#9a9a9a;">
          If you weren't expecting this invitation, you can ignore this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
`.trim();

  return { subject, html, text, attachments: [emailLogoAttachment()] };
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
