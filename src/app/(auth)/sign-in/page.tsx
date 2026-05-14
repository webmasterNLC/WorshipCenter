import { redirect } from 'next/navigation';
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
      <div className="mb-6 flex justify-center">
        <span
          className="nlc-logo h-20 w-20"
          role="img"
          aria-label="NLC Burgdorf"
        />
      </div>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-(--color-muted-fg)">
        Enter your email and password.
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

      <form action={signInAction} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-(--color-accent) px-3 py-2 font-medium text-(--color-accent-fg)"
        >
          Sign in
        </button>
      </form>
    </>
  );
}
