import Link from 'next/link';
import { Home, Music, ListMusic, ShieldCheck, User, LogOut } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Session } from '@/server/auth/require';
import { NavLink } from './NavLink';
import { signOutAction } from '@/server/actions/auth';

type NavIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

export function SideRail({ session }: { session: Session }) {
  const items: Array<{ href: string; label: string; icon: NavIcon }> = [
    { href: '/home', label: 'Home', icon: Home },
    { href: '/songs', label: 'Songs', icon: Music },
    { href: '/playlists', label: 'Programs', icon: ListMusic },
    ...(session.profile.role === 'admin'
      ? [{ href: '/admin/users', label: 'Admin', icon: ShieldCheck }]
      : []),
    { href: '/me', label: 'Profile', icon: User },
  ];

  return (
    <aside className="hidden border-r border-(--color-border) px-3 py-6 md:flex md:flex-col md:gap-6">
      <Link href="/home" className="flex items-baseline gap-1.5 px-3">
        <span className="font-display-tight text-2xl">Song</span>
        <span className="font-display-tight text-2xl italic text-(--color-accent)">drop</span>
      </Link>
      <ul className="grid gap-0.5">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <NavLink href={href}>
              <Icon className="size-4" aria-hidden />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mt-auto px-3 pt-6 border-t border-(--color-border) grid gap-3">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.22em] text-(--color-muted-fg)">
            Signed in
          </p>
          <p className="font-display text-sm mt-1 truncate">{session.profile.display_name}</p>
          <p className="text-xs text-(--color-muted-fg) capitalize">{session.profile.role}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-(--color-muted-fg) hover:bg-(--color-muted) hover:text-(--color-danger) transition-colors"
          >
            <LogOut className="size-3.5" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
