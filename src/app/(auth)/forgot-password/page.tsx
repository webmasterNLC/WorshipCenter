import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function requestReset(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (email.includes('@')) {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const origin = host ? `${proto}://${host}` : (process.env.APP_ORIGIN ?? 'http://localhost:3000');

    // Supabase emails a recovery link → /api/auth/callback exchanges the code
    // and forwards to /reset-password, where the user picks a new password.
    const sb = await createSupabaseServerClient();
    await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/api/auth/callback?next=/reset-password`,
    });
  }
  // Always report success — never reveal whether an account exists.
  redirect('/forgot-password?sent=1');
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  if (sent) {
    return (
      <>
        <h1 className="mb-1 text-xl font-semibold">Check your email</h1>
        <p className="mb-6 text-sm text-(--color-muted-fg)">
          If an account exists for that address, we&apos;ve sent a link to reset your
          password. Open it on this device and click it once.
        </p>
        <Link href="/sign-in" className="text-sm text-(--color-accent) hover:underline">
          ← Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Reset your password</h1>
      <p className="mb-6 text-sm text-(--color-muted-fg)">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <form action={requestReset} className="grid gap-3">
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
          Send reset link
        </button>
      </form>
      <Link
        href="/sign-in"
        className="mt-4 inline-block text-sm text-(--color-muted-fg) hover:text-(--color-accent)"
      >
        ← Back to sign in
      </Link>
    </>
  );
}
