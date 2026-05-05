import 'server-only';

export interface PlaylistShareEmailInput {
  senderName: string;
  playlistName: string;
  scheduledFor?: string | null;
  message?: string | null;
  url: string;
}

export function renderPlaylistShareEmail(input: PlaylistShareEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { senderName, playlistName, scheduledFor, message, url } = input;

  const subject = `Setlist shared: ${playlistName}`;

  const dateLabel = scheduledFor ? ` — ${scheduledFor}` : '';
  const optionalMessage = message ? `\n\n${message}` : '';

  const text = [
    `${senderName} shared a setlist with you.`,
    ``,
    `${playlistName}${dateLabel}${optionalMessage}`,
    ``,
    `Open: ${url}`,
    ``,
    `Sign in with your account to view.`,
  ].join('\n');

  const html = `
<!doctype html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a">
  <h2 style="margin:0 0 16px">Setlist shared: ${esc(playlistName)}</h2>
  <p><strong>${esc(senderName)}</strong> shared a setlist with you.</p>
  <p style="font-size:18px;font-weight:600">${esc(playlistName)}${dateLabel ? `<span style="font-weight:400;color:#475569"> ${esc(scheduledFor ?? '')}</span>` : ''}</p>
  ${message ? `<p style="color:#334155">${esc(message)}</p>` : ''}
  <p>
    <a href="${esc(url)}" style="display:inline-block;background:#b45309;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Open setlist</a>
  </p>
  <p style="color:#475569;font-size:14px">Sign in with your account to view.</p>
</body></html>
`.trim();

  return { subject, html, text };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
