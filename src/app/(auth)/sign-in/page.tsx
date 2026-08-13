import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function signInAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !email.includes('@')) redirect('/sign-in?error=invalid_email');
  if (!password) redirect('/sign-in?error=missing_password');

  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('[signin] supabase error:', error.message);
    redirect('/sign-in?error=invalid_credentials');
  }
  redirect('/home');
}

function friendlySignInError(code: string): string {
  switch (code) {
    case 'invalid_email':
      return 'Please enter a valid email address.';
    case 'missing_password':
      return 'Please enter your password.';
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const { error, invite } = await searchParams;

  return (
    <>
      {/* Logo moved to the auth layout so every auth screen carries it. */}
      <h1 className="mb-1 text-2xl">Welcome back</h1>
      <p className="mb-6 text-sm text-(--color-muted-fg)">
        Sign in to WorshipCenter.
      </p>

      {invite === 'invalid' && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          That invitation link is invalid or has expired.
        </p>
      )}
      {invite === 'already_used' && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          That invitation has already been used. Sign in below if you have an account.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          {friendlySignInError(error)}
        </p>
      )}

      <form action={signInAction} className="grid gap-4">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2.5 outline-none focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2.5 outline-none focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)"
          />
        </label>
        <button
          type="submit"
          className="mt-1 rounded-lg bg-(--color-accent) px-3 py-2.5 font-medium text-(--color-accent-fg) transition-opacity hover:opacity-90"
        >
          Sign in
        </button>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link
          href="/forgot-password"
          className="text-(--color-muted-fg) underline-offset-4 hover:text-(--color-accent) hover:underline"
        >
          Forgot password?
        </Link>
      </p>
    </>
  );
}
