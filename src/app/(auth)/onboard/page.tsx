import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadSession } from '@/server/auth/require';

const PASSWORD_RE = /^(?=.*[^A-Za-z0-9]).{12,}$/;

async function completeOnboarding(formData: FormData) {
  'use server';
  const displayName = String(formData.get('display_name') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (displayName.length < 1 || displayName.length > 80) {
    redirect('/onboard?error=name');
  }
  if (!PASSWORD_RE.test(password)) {
    redirect('/onboard?error=password');
  }

  const session = await loadSession();
  if (!session) redirect('/sign-in?error=session');

  const sb = await createSupabaseServerClient();
  const { error: passError } = await sb.auth.updateUser({ password });
  if (passError) redirect(`/onboard?error=${encodeURIComponent(passError.message)}`);

  const { error: nameError } = await sb
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', session.user.id);
  if (nameError) redirect(`/onboard?error=${encodeURIComponent(nameError.message)}`);

  redirect('/home');
}

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await loadSession();
  if (!session) redirect('/sign-in');
  const { error } = await searchParams;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Welcome — set up your profile</h1>
      <p className="mb-6 text-sm text-(--color-muted-fg)">
        Choose a display name and a password.
      </p>
      {error && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          {error === 'name'
            ? 'Display name must be 1–80 characters.'
            : error === 'password'
              ? 'Password must be at least 12 characters and include a non-alphanumeric character.'
              : error}
        </p>
      )}
      <form action={completeOnboarding} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>Display name</span>
          <input
            type="text" name="display_name" required maxLength={80}
            defaultValue={session.profile.display_name}
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Password</span>
          <input
            type="password" name="password" required minLength={12}
            autoComplete="new-password"
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2"
          />
          <span className="text-xs text-(--color-muted-fg)">
            12+ chars, at least one non-alphanumeric.
          </span>
        </label>
        <button type="submit" className="rounded-md bg-(--color-accent) px-3 py-2 font-medium text-(--color-accent-fg)">
          Save and continue
        </button>
      </form>
    </>
  );
}
