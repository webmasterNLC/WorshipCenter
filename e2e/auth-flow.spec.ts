// E2E for Plan A:
//   1) Unauthenticated visit redirects to /sign-in.
//   2) Sign-in page renders the magic-link form.
//   3) After password-based sign-in (via Supabase REST), admin can land on
//      /home, /admin/users, /admin/invites; can send + revoke an invite.
//
// Magic-link click-through is deferred to Plan B (with Inbucket interception),
// because here we verify the gated routes & invite flow without round-tripping
// an email.
import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@nlc-burgdorf.local';
const ADMIN_PASSWORD = process.env.SEED_PASSWORD ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

test.skip(
  !ADMIN_PASSWORD || !SUPABASE_URL || !SUPABASE_ANON,
  'Required env (SEED_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY) not set.',
);

async function adminAuthCookies(request: APIRequestContext): Promise<{
  access_token: string;
  refresh_token: string;
}> {
  const res = await request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    },
  );
  if (!res.ok()) throw new Error(`signin failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { access_token: body.access_token, refresh_token: body.refresh_token };
}

test('unauthenticated visit redirects to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

test('admin can sign in, see admin pages, and send + revoke an invitation', async ({
  page,
  context,
  request,
}) => {
  const { access_token, refresh_token } = await adminAuthCookies(request);
  // Set the session cookies the @supabase/ssr server client expects.
  // The cookie name follows the Supabase SSR convention: `sb-<project-ref>-auth-token`.
  // We use the more robust approach: set both `sb-access-token` and `sb-refresh-token`,
  // which the SSR client's compatibility layer reads.
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0] ?? 'project';
  const cookieValue = JSON.stringify({ access_token, refresh_token });
  const baseURL = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  const host = new URL(baseURL).hostname;
  await context.addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: encodeURIComponent(cookieValue),
      domain: host,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  await page.goto('/home');
  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();

  await page.goto('/admin/invites');
  const testEmail = `e2e-${Date.now()}@example.test`;
  await page.getByLabel('Email').fill(testEmail);
  await page.getByLabel('Role').selectOption('musician');
  await page.getByRole('button', { name: /send invitation/i }).click();
  await expect(page.getByText(testEmail)).toBeVisible();

  await page.getByRole('button', { name: /revoke/i }).first().click();
  await expect(page.getByText(testEmail)).not.toBeVisible();
});
