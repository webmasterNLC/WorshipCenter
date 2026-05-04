import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function signInAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) redirect('/sign-in?error=invalid_email');

  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.APP_ORIGIN}/api/auth/callback?next=/home` },
  });
  if (error) redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  redirect('/sign-in?sent=1');
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; invite?: string }>;
}) {
  const { sent, error, invite } = await searchParams;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-(--color-muted-fg)">
        We&apos;ll email you a magic link.
      </p>

      {invite === 'invalid' && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          That invitation link is invalid or has expired.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          {error}
        </p>
      )}
      {sent && (
        <p className="mb-4 rounded-md border border-(--color-accent)/30 bg-(--color-accent)/10 p-3 text-sm">
          Check your inbox for the sign-in link.
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
        <button
          type="submit"
          className="rounded-md bg-(--color-accent) px-3 py-2 font-medium text-(--color-accent-fg)"
        >
          Send magic link
        </button>
      </form>
    </>
  );
}
