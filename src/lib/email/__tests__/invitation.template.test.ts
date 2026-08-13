import { describe, it, expect } from 'vitest';
import { renderInvitationEmail } from '../templates/invitation';

describe('renderInvitationEmail', () => {
  it('renders subject, html, and text with the accept URL escaped', () => {
    const out = renderInvitationEmail({
      acceptUrl: 'https://example.org/accept?token=<abc>&role=admin',
      inviterName: 'Lisa <Maria>',
      role: 'leader',
      expiresAt: new Date('2026-05-07T12:00:00Z'),
    });
    expect(out.subject).toMatch(/WorshipCenter/);
    expect(out.html).toContain('Lisa &lt;Maria&gt;');
    expect(out.html).toContain('token=&lt;abc&gt;&amp;role=admin');
    expect(out.text).toContain('https://example.org/accept?token=<abc>&role=admin'); // raw in text is fine
    expect(out.text).toContain('Leiter'); // role rendered with its German label
  });
});
