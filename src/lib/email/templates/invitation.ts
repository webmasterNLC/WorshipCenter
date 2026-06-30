import 'server-only';

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
} {
  const { acceptUrl, inviterName, role, expiresAt } = input;
  const expiry = expiresAt.toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });

  const roleLabel = { admin: 'Administrator', leader: 'Worship-Leiter', viewer: 'Mitglied' }[role];

  const subject = `Einladung zu NLC Burgdorf SongDrop`;

  const text = [
    `Hallo,`,
    ``,
    `${inviterName} hat dich als ${roleLabel} zu NLC Burgdorf SongDrop eingeladen.`,
    ``,
    `Öffne diesen Link, um die Einladung anzunehmen und dein Konto einzurichten:`,
    `${acceptUrl}`,
    ``,
    `Der Link läuft am ${expiry} ab und kann nur einmal verwendet werden.`,
    ``,
    `Falls du diese E-Mail nicht erwartet hast, kannst du sie ignorieren.`,
    ``,
    `— NLC Burgdorf SongDrop`,
  ].join('\n');

  // Logo lives on the same origin as the accept link — no hardcoded domain.
  const logoUrl = `${new URL(acceptUrl).origin}/nlc-logo.png`;

  const html = `
<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;margin:0;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;">
      <tr><td align="center" style="padding:32px 32px 20px 32px;border-bottom:2px solid #1F3A60;">
        <img src="${escape(logoUrl)}" width="58" height="59" alt="NLC Burgdorf" style="display:block;margin:0 auto 10px auto;border:0;outline:none;">
        <span style="color:#1F3A60;font-size:13px;font-weight:bold;letter-spacing:4px;text-transform:uppercase;">SongDrop</span>
      </td></tr>
      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.2;color:#16181d;letter-spacing:-0.01em;">Du bist eingeladen</h1>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#6b6b6b;">
          <strong style="color:#16181d;">${escape(inviterName)}</strong> hat dich als <strong style="color:#16181d;">${escape(roleLabel)}</strong> zu NLC Burgdorf SongDrop eingeladen. Nimm die Einladung an, um dein Konto einzurichten.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
          <tr><td bgcolor="#1F3A60" style="border-radius:8px;">
            <a href="${escape(acceptUrl)}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Einladung annehmen</a>
          </td></tr>
        </table>
        <p style="margin:0 0 6px 0;font-size:12px;color:#9a9a9a;">Falls der Button nicht funktioniert, kopiere diesen Link:</p>
        <p style="margin:0 0 8px 0;font-size:12px;word-break:break-all;"><a href="${escape(acceptUrl)}" style="color:#1F3A60;">${escape(acceptUrl)}</a></p>
        <p style="margin:16px 0 0 0;font-size:13px;color:#6b6b6b;">Der Link läuft am ${escape(expiry)} ab und kann nur einmal verwendet werden.</p>
      </td></tr>
      <tr><td style="border-top:1px solid #e5e5e5;padding:20px 32px;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#9a9a9a;">
          Falls du diese Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
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
