import Link from 'next/link';
import { Home, Music, ListMusic, ShieldCheck, User } from 'lucide-react';
import type { Session } from '@/server/auth/require';

export function SideRail({ session }: { session: Session }) {
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
    <aside className="hidden border-r border-(--color-border) px-3 py-6 md:block">
      <div className="px-3 pb-6 font-semibold tracking-tight">SongDrop</div>
      <ul className="grid gap-1">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-(--color-muted-fg) hover:bg-(--color-muted) hover:text-(--color-fg)"
            >
              <Icon className="size-4" aria-hidden />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
