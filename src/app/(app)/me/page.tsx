import { redirect } from 'next/navigation';
import { User, Mail, KeyRound, LogOut } from 'lucide-react';
import { loadSession } from '@/server/auth/require';
import {
  updateMyProfile,
  updateMyEmail,
  updateMyPassword,
} from '@/server/actions/profile';
import { signOutAction } from '@/server/actions/auth';
import { runAction } from '@/server/actions/_action-result';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface PageProps {
  searchParams: Promise<{ ok?: string; err?: string }>;
}

const BANNERS: Record<string, { tone: 'ok' | 'err'; text: string }> = {
  'name-saved':    { tone: 'ok',  text: 'Display name updated.' },
  'email-sent':    { tone: 'ok',  text: 'Confirmation email sent — click the link in your inbox to finish the change.' },
  'pw-saved':      { tone: 'ok',  text: 'Password updated.' },
  'name-fail':     { tone: 'err', text: 'Could not update display name. Please check the value and try again.' },
  'email-fail':    { tone: 'err', text: 'Could not update email. Please check the address and try again.' },
  'pw-fail':       { tone: 'err', text: 'Could not update password — must be at least 12 characters.' },
  'pw-wrong-current': { tone: 'err', text: 'Could not update password. Check your current password, and that the new one is at least 12 characters.' },
  'pw-reauth':     { tone: 'err', text: 'To change your password while signed in, enter your current one below.' },
};

export default async function MePage({ searchParams }: PageProps) {
  const session = await loadSession();
  if (!session) return null;

  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  const currentEmail = user?.email ?? '';

  const { ok, err } = await searchParams;
  const banner = ok ? BANNERS[ok] : err ? BANNERS[err] : null;

  async function saveDisplayName(form: FormData) {
    'use server';
    const result = await runAction(() =>
      updateMyProfile({ display_name: String(form.get('display_name') ?? '') }),
    );
    redirect(`/me?${result.ok ? 'ok=name-saved' : 'err=name-fail'}`);
  }

  async function saveEmail(form: FormData) {
    'use server';
    const result = await runAction(() =>
      updateMyEmail({ email: String(form.get('email') ?? '') }),
    );
    redirect(`/me?${result.ok ? 'ok=email-sent' : 'err=email-fail'}`);
  }

  async function savePassword(form: FormData) {
    'use server';
    const result = await runAction(() =>
      updateMyPassword({
        current_password: String(form.get('current_password') ?? ''),
        password: String(form.get('password') ?? ''),
      }),
    );
    redirect(`/me?${result.ok ? 'ok=pw-saved' : 'err=pw-wrong-current'}`);
  }

  return (
    <div className="grid gap-6 max-w-2xl">

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.tone === 'ok'
              ? 'border-(--color-accent)/40 bg-(--color-accent)/10 text-(--color-fg)'
              : 'border-(--color-danger)/40 bg-(--color-danger)/10 text-(--color-danger)'
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Display name */}
      <section className="grid gap-3 rounded-2xl border border-(--color-border) p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-(--color-muted) text-(--color-accent)">
            <User className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg">Display name</h2>
            <p className="text-xs text-(--color-muted-fg)">How others on the band see you.</p>
          </div>
        </div>
        <form action={saveDisplayName} className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            name="display_name"
            required
            maxLength={80}
            defaultValue={session.profile.display_name}
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
          >
            Save
          </button>
        </form>
      </section>

      {/* Email */}
      <section className="grid gap-3 rounded-2xl border border-(--color-border) p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-(--color-muted) text-(--color-accent)">
            <Mail className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg">Email address</h2>
            <p className="text-xs text-(--color-muted-fg)">
              Changing this sends a confirmation link to the new address — the change only takes effect after you click it.
            </p>
          </div>
        </div>
        <form action={saveEmail} className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="email"
            name="email"
            required
            maxLength={320}
            defaultValue={currentEmail}
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg border border-(--color-border) px-4 py-2 text-sm font-medium hover:border-(--color-accent) hover:text-(--color-accent)"
          >
            Change
          </button>
        </form>
      </section>

      {/* Sign out — placed before password so users find the exit fast.
          Yes, intentionally above sensitive forms; the rail also has it. */}
      <section className="flex items-center justify-between rounded-2xl border border-(--color-border) p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-(--color-muted) text-(--color-muted-fg)">
            <LogOut className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg">Sign out</h2>
            <p className="text-xs text-(--color-muted-fg)">
              End this session on this device.
            </p>
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-lg border border-(--color-border) px-4 py-2 text-sm font-medium hover:border-(--color-danger) hover:text-(--color-danger) transition-colors"
          >
            Sign out
          </button>
        </form>
      </section>

      {/* Password */}
      <section className="grid gap-3 rounded-2xl border border-(--color-border) p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-(--color-muted) text-(--color-accent)">
            <KeyRound className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg">Password</h2>
            <p className="text-xs text-(--color-muted-fg)">
              At least 12 characters. You stay signed in after changing.
            </p>
          </div>
        </div>
        <form action={savePassword} className="grid gap-2">
          <input
            type="password"
            name="current_password"
            required
            maxLength={128}
            placeholder="Current password"
            autoComplete="current-password"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="password"
              name="password"
              required
              minLength={12}
              maxLength={128}
              placeholder="New password"
              autoComplete="new-password"
              className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg border border-(--color-border) px-4 py-2 text-sm font-medium hover:border-(--color-accent) hover:text-(--color-accent)"
            >
              Update
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
