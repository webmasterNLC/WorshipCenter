import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Mail, KeyRound, Ban } from 'lucide-react';
import {
  adminGetUserDetail,
  adminUpdateUserDisplayName,
  adminUpdateUserEmail,
  adminResetUserPassword,
  adminDisableUser,
} from '@/server/actions/profile';
import { runAction } from '@/server/actions/_action-result';
import { loadSession } from '@/server/auth/require';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string; confirm?: string }>;
}

const BANNERS: Record<string, { tone: 'ok' | 'err'; text: string }> = {
  'name-saved':    { tone: 'ok',  text: 'Display name updated.' },
  'email-saved':   { tone: 'ok',  text: 'Email updated immediately (no confirmation sent).' },
  'pw-saved':      { tone: 'ok',  text: 'Password updated. Tell the user the new credentials securely.' },
  'name-fail':     { tone: 'err', text: 'Could not update display name.' },
  'email-fail':    { tone: 'err', text: 'Could not update email — check the address and try again.' },
  'pw-fail':       { tone: 'err', text: 'Could not update password — must be at least 12 characters.' },
  'disable-fail':  { tone: 'err', text: 'Could not deactivate this user.' },
};

export default async function AdminUserDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { ok, err, confirm } = await searchParams;
  const banner = ok ? BANNERS[ok] : err ? BANNERS[err] : null;
  const confirmDisable = confirm === 'disable';

  const [user, session] = await Promise.all([
    adminGetUserDetail(id),
    loadSession(),
  ]);
  if (!user) notFound();

  const isSelf = session?.profile.id === id;

  async function saveDisplayName(form: FormData) {
    'use server';
    const result = await runAction(() =>
      adminUpdateUserDisplayName({
        user_id: id,
        display_name: String(form.get('display_name') ?? ''),
      }),
    );
    redirect(`/admin/users/${id}?${result.ok ? 'ok=name-saved' : 'err=name-fail'}`);
  }

  async function saveEmail(form: FormData) {
    'use server';
    const result = await runAction(() =>
      adminUpdateUserEmail({
        user_id: id,
        email: String(form.get('email') ?? ''),
      }),
    );
    redirect(`/admin/users/${id}?${result.ok ? 'ok=email-saved' : 'err=email-fail'}`);
  }

  async function savePassword(form: FormData) {
    'use server';
    const result = await runAction(() =>
      adminResetUserPassword({
        user_id: id,
        password: String(form.get('password') ?? ''),
      }),
    );
    redirect(`/admin/users/${id}?${result.ok ? 'ok=pw-saved' : 'err=pw-fail'}`);
  }

  async function disableAction(form: FormData) {
    'use server';
    const result = await runAction(() =>
      adminDisableUser({ user_id: String(form.get('user_id') ?? '') }),
    );
    if (result.ok) {
      redirect('/admin/users?ok=user-disabled');
    }
    redirect(`/admin/users/${id}?err=disable-fail`);
  }

  return (
    <div className="grid gap-6 max-w-2xl">

      <header className="grid gap-2">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-(--color-muted-fg) hover:text-(--color-accent) w-fit"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to members
        </Link>
        <h1 className="font-display-tight text-3xl md:text-4xl mt-1">
          {user.display_name}
          {isSelf && (
            <span className="ml-3 text-xs uppercase tracking-[0.18em] text-(--color-accent) align-middle">
              You
            </span>
          )}
        </h1>
        <p className="text-sm text-(--color-muted-fg) capitalize">
          {user.role} · joined {new Date(user.created_at).toLocaleDateString()}
          {user.last_sign_in_at && (
            <> · last seen {new Date(user.last_sign_in_at).toLocaleDateString()}</>
          )}
        </p>
      </header>

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
          <h2 className="font-display text-lg">Display name</h2>
        </div>
        <form action={saveDisplayName} className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            name="display_name"
            required
            maxLength={80}
            defaultValue={user.display_name}
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
            <h2 className="font-display text-lg">Email</h2>
            <p className="text-xs text-(--color-muted-fg)">
              Admin override — set immediately, no confirmation email sent.
            </p>
          </div>
        </div>
        <form action={saveEmail} className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="email"
            name="email"
            required
            maxLength={320}
            defaultValue={user.email ?? ''}
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg border border-(--color-border) px-4 py-2 text-sm font-medium hover:border-(--color-accent) hover:text-(--color-accent)"
          >
            Change
          </button>
        </form>
        {user.email_confirmed_at == null && (
          <p className="text-xs text-(--color-danger)">
            Email not yet confirmed.
          </p>
        )}
      </section>

      {/* Password */}
      <section className="grid gap-3 rounded-2xl border border-(--color-border) p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-(--color-muted) text-(--color-accent)">
            <KeyRound className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg">Password reset</h2>
            <p className="text-xs text-(--color-muted-fg)">
              Set a new password for this user. Existing sessions stay valid until they expire.
            </p>
          </div>
        </div>
        <form action={savePassword} className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            name="password"
            required
            minLength={12}
            maxLength={128}
            placeholder="New password (≥ 12 characters)"
            autoComplete="off"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm font-mono"
          />
          <button
            type="submit"
            className="rounded-lg border border-(--color-danger)/40 text-(--color-danger) px-4 py-2 text-sm font-medium hover:bg-(--color-danger)/10"
          >
            Reset
          </button>
        </form>
      </section>

      {/* Danger zone — soft-delete (one-way from UI) */}
      <section className="grid gap-3 rounded-2xl border border-(--color-danger)/40 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-(--color-danger)/10 text-(--color-danger)">
            <Ban className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg">Deactivate account</h2>
            <p className="text-xs text-(--color-muted-fg)">
              Blocks login, removes this member from the admin list and rota
              picker, and clears them from upcoming service assignments. Past
              assignments and audit history are preserved. To reverse, contact a
              developer — there is no UI for it.
            </p>
          </div>
        </div>
        {isSelf ? (
          <p className="text-xs text-(--color-muted-fg)">
            You cannot deactivate yourself.
          </p>
        ) : confirmDisable ? (
          <div className="grid gap-3 rounded-xl border-2 border-(--color-danger) bg-(--color-danger)/5 p-4">
            <p className="text-sm">
              <strong>Confirm:</strong> deactivate <em>{user.display_name}</em>?
              This is one-way from the UI.
            </p>
            <div className="flex gap-2">
              <form action={disableAction}>
                <input type="hidden" name="user_id" value={user.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-(--color-danger) text-white px-4 py-2 text-sm font-medium hover:opacity-90"
                >
                  Yes, deactivate
                </button>
              </form>
              <Link
                href={`/admin/users/${user.id}`}
                className="rounded-lg border border-(--color-border) px-4 py-2 text-sm hover:border-(--color-accent)"
              >
                Cancel
              </Link>
            </div>
          </div>
        ) : (
          <Link
            href={`/admin/users/${user.id}?confirm=disable`}
            className="rounded-lg border border-(--color-danger)/40 text-(--color-danger) px-4 py-2 text-sm font-medium hover:bg-(--color-danger)/10 self-start"
          >
            Deactivate {user.display_name}
          </Link>
        )}
      </section>
    </div>
  );
}
