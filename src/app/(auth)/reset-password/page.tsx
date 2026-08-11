import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadSession } from '@/server/auth/require';
import { sessionAuthMethods, usedPassword } from '@/lib/auth/session-methods';

const PASSWORD_RE = /^(?=.*[^A-Za-z0-9]).{12,}$/;

async function setNewPassword(formData: FormData) {
  'use server';
  const password = String(formData.get('password') ?? '');
  if (!PASSWORD_RE.test(password)) redirect('/reset-password?error=password');

  // The recovery link gave us a session via /api/auth/callback; updateUser
  // changes the password on it. No session → the link was invalid/expired.
  const session = await loadSession();
  if (!session) redirect('/sign-in?error=recovery');

  const sb = await createSupabaseServerClient();

  // A session created by signing in with a password must not be able to set a
  // new one here — that would let a stolen cookie lock the owner out without
  // ever knowing the current password. Those users have /me, which asks for it.
  if (usedPassword(await sessionAuthMethods(sb))) {
    redirect('/me?err=pw-reauth');
  }

  const { error } = await sb.auth.updateUser({ password });
  if (error) redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);

  redirect('/home');
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Reached only with a valid recovery session (the callback exchanged the
  // code). Without one, the link was already used or expired — send to sign-in.
  const session = await loadSession();
  if (!session) redirect('/sign-in?error=recovery');

  // Same gate as the action, so a password-session lands on the right form
  // instead of filling this one in and being bounced on submit.
  const sbGate = await createSupabaseServerClient();
  if (usedPassword(await sessionAuthMethods(sbGate))) {
    redirect('/me?err=pw-reauth');
  }
  const { error } = await searchParams;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Choose a new password</h1>
      <p className="mb-6 text-sm text-(--color-muted-fg)">
        Set a new password below.
      </p>
      {error && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          {error === 'password'
            ? 'Password must be at least 12 characters and include a non-alphanumeric character.'
            : error}
        </p>
      )}
      <form action={setNewPassword} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>New password</span>
          <input
            type="password"
            name="password"
            required
            minLength={12}
            autoComplete="new-password"
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
          <span className="text-xs text-(--color-muted-fg)">
            12+ chars, at least one non-alphanumeric.
          </span>
        </label>
        <button
          type="submit"
          className="rounded-md bg-(--color-accent) px-3 py-2 font-medium text-(--color-accent-fg)"
        >
          Save new password
        </button>
      </form>
      <Link
        href="/home"
        className="mt-4 inline-block text-sm text-(--color-muted-fg) hover:text-(--color-accent)"
      >
        Skip for now →
      </Link>
    </>
  );
}
