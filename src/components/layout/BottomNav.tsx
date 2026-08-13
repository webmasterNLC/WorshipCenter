import Link from 'next/link';
import { Home, Music, ListMusic, ShieldCheck, User } from 'lucide-react';
import type { Session } from '@/server/auth/require';

export function BottomNav({ session }: { session: Session }) {
  const items: Array<{ href: string; label: string; icon: React.ElementType }> = [
    { href: '/home', label: 'Home', icon: Home },
    { href: '/songs', label: 'Songs', icon: Music },
    { href: '/playlists', label: 'Playlists', icon: ListMusic },
    ...(session.profile.role === 'admin'
      ? [{ href: '/admin/users', label: 'Admin', icon: ShieldCheck }]
      : []),
    { href: '/me', label: 'Me', icon: User },
  ];

  return (
    // pb: same reason as TopBar's pt — the home indicator on iOS and the
    // gesture bar on Android otherwise sit on top of the tab labels.
    <nav className="border-t border-(--color-border) pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex flex-col items-center gap-1 px-2 py-2 text-xs text-(--color-muted-fg) hover:text-(--color-fg)"
            >
              <Icon className="size-5" aria-hidden />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
