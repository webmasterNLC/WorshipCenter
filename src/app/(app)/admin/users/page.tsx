import Link from 'next/link';
import { Mail, ScrollText, ShieldCheck, UserPlus, X, Settings } from 'lucide-react';
import { loadSession } from '@/server/auth/require';
import {
  adminSetUserRole,
  toggleCapability,
  listMembersForAdmin,
} from '@/server/actions/profile';
import {
  listPendingInvitations,
  sendInvitation,
  revokeInvitation,
} from '@/server/actions/invitations';
import { CapabilityChips } from '@/components/admin/CapabilityChips';
import type { Capability } from '@/server/actions/profile.schemas';

async function changeRoleAction(formData: FormData) {
  'use server';
  await adminSetUserRole({
    user_id: String(formData.get('user_id') ?? ''),
    role: String(formData.get('role') ?? '') as 'admin' | 'leader' | 'viewer',
  });
}

async function sendInviteAction(formData: FormData) {
  'use server';
  await sendInvitation({
    email: String(formData.get('email') ?? ''),
    role: String(formData.get('role') ?? '') as 'admin' | 'leader' | 'viewer',
  });
}

async function revokeInviteAction(formData: FormData) {
  'use server';
  await revokeInvitation({ id: String(formData.get('id') ?? '') });
}

// toggleCapability is a plain server-only helper, so it can't be handed to a
// client component directly — wrap it as a server action, like the others.
async function toggleCapabilityAction(input: {
  user_id: string;
  capability: Capability;
  enabled: boolean;
}) {
  'use server';
  await toggleCapability(input);
}

interface AdminMembersPageProps {
  searchParams: Promise<{ ok?: string }>;
}

const BANNERS: Record<string, { tone: 'ok' | 'err'; text: string }> = {
  'user-disabled': { tone: 'ok', text: 'Member deactivated. They can no longer log in.' },
};

export default async function AdminMembersPage({ searchParams }: AdminMembersPageProps) {
  const session = await loadSession();
  if (!session) return null;

  const { ok } = await searchParams;
  const banner = ok ? BANNERS[ok] : null;

  const [members, pending] = await Promise.all([
    listMembersForAdmin(),
    listPendingInvitations(),
  ]);

  return (
    <div className="grid gap-8 max-w-5xl">

      {/* Hero */}
      <header className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.22em] text-(--color-muted-fg)">
          Administration
        </span>
        <h1 className="font-display-tight text-4xl md:text-5xl">
          The <em className="text-(--color-accent) not-italic">band</em>.
        </h1>
        <p className="text-sm text-(--color-muted-fg) max-w-prose">
          {members.length} {members.length === 1 ? 'member' : 'members'} ·{' '}
          {pending.length} pending {pending.length === 1 ? 'invitation' : 'invitations'}
        </p>
        <Link
          href="/admin/audit"
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2 text-xs text-(--color-muted-fg) hover:border-(--color-accent) hover:text-(--color-accent)"
        >
          <ScrollText className="size-3.5" aria-hidden />
          Activity log
        </Link>
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

      {/* Invite section */}
      <section className="grid gap-4 rounded-2xl border border-(--color-border) bg-(--color-muted)/30 p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-(--color-bg) border border-(--color-border) text-(--color-accent)">
            <UserPlus className="size-4" aria-hidden />
          </div>
          <div>
            <h2 className="font-display text-lg">Invite a new member</h2>
            <p className="text-xs text-(--color-muted-fg)">
              They&apos;ll receive an email with a one-time link to set their password.
            </p>
          </div>
        </div>

        <form
          action={sendInviteAction}
          className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end"
        >
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs uppercase tracking-[0.18em] text-(--color-muted-fg)">
              Email
            </span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-muted-fg)" aria-hidden />
              <input
                type="email"
                name="email"
                required
                placeholder="name@example.org"
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) pl-10 pr-3 py-2.5 text-sm focus:border-(--color-accent) focus:outline-none"
              />
            </div>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs uppercase tracking-[0.18em] text-(--color-muted-fg)">
              Role
            </span>
            <select
              name="role"
              required
              defaultValue="viewer"
              className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2.5 text-sm focus:border-(--color-accent) focus:outline-none"
            >
              <option value="admin">Admin</option>
              <option value="leader">Worship leader</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-(--color-accent) px-4 py-2.5 text-sm font-medium text-(--color-accent-fg) hover:opacity-90"
          >
            Send invitation
          </button>
        </form>

        {pending.length > 0 && (
          <ul className="grid gap-1.5 border-t border-(--color-border) pt-4">
            <p className="text-xs uppercase tracking-[0.18em] text-(--color-muted-fg) mb-1">
              Pending
            </p>
            {pending.map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-dashed border-(--color-border) bg-(--color-bg) px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm truncate block">{p.email}</span>
                  <span className="text-xs text-(--color-muted-fg) capitalize">
                    {p.role} · expires {new Date(p.expires_at).toLocaleDateString()}
                  </span>
                </div>
                <span className="text-xs uppercase tracking-[0.14em] text-(--color-muted-fg)">
                  Awaiting
                </span>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    aria-label={`Revoke invitation to ${p.email}`}
                    className="grid size-7 place-items-center rounded-md border border-(--color-border) text-(--color-muted-fg) hover:border-(--color-danger) hover:text-(--color-danger)"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Members table */}
      <section className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl flex items-baseline gap-2">
            <span className="section-tick" aria-hidden />
            Members
          </h2>
          <span className="text-xs uppercase tracking-[0.16em] text-(--color-muted-fg)">
            Capabilities apply to the service rota
          </span>
        </div>

        <ul className="grid gap-2">
          {members.map((m) => {
            const isSelf = m.id === session.profile.id;
            return (
              <li
                key={m.id}
                className="grid gap-3 rounded-xl border border-(--color-border) p-4 md:grid-cols-[1fr_auto] md:items-start"
              >
                <div className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-full bg-(--color-muted) font-display text-base">
                      {m.display_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-base truncate flex items-center gap-2">
                        {m.display_name}
                        {isSelf && (
                          <span className="text-xs uppercase tracking-[0.14em] text-(--color-accent)">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-(--color-muted-fg) capitalize flex items-center gap-1.5">
                        {m.role === 'admin' && (
                          <ShieldCheck className="size-3" aria-hidden />
                        )}
                        {m.role} · joined {new Date(m.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[0.62rem] uppercase tracking-[0.22em] text-(--color-muted-fg) mb-2">
                      Can play
                    </p>
                    <CapabilityChips
                      userId={m.id}
                      initial={m.capabilities}
                      toggle={toggleCapabilityAction}
                    />
                  </div>
                </div>

                <div className="flex flex-col items-stretch gap-2">
                  <form
                    action={changeRoleAction}
                    className="flex items-end gap-2 md:flex-col md:items-stretch"
                  >
                    <input type="hidden" name="user_id" value={m.id} />
                    <label className="grid gap-1 text-xs">
                      <span className="uppercase tracking-[0.18em] text-(--color-muted-fg)">
                        Role
                      </span>
                      <select
                        name="role"
                        defaultValue={m.role}
                        disabled={isSelf}
                        className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm disabled:opacity-50"
                      >
                        <option value="admin">Admin</option>
                        <option value="leader">Leader</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={isSelf}
                      className="rounded-lg bg-(--color-accent) px-3 py-2 text-xs font-medium text-(--color-accent-fg) hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Save role
                    </button>
                  </form>
                  <Link
                    href={`/admin/users/${m.id}`}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2 text-xs text-(--color-muted-fg) hover:border-(--color-accent) hover:text-(--color-accent)"
                  >
                    <Settings className="size-3.5" aria-hidden />
                    Manage account
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
