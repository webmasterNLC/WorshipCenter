import Link from 'next/link';
import type { Session } from '@/server/auth/require';

export function TopBar({ session }: { session: Session }) {
  return (
    <header className="flex items-center justify-between border-b border-(--color-border) px-4 py-3 md:px-8">
      <Link href="/home" className="md:hidden flex items-baseline gap-1">
        <span className="font-display-tight text-xl">Song</span>
        <span className="font-display-tight text-xl italic text-(--color-accent)">drop</span>
      </Link>
      <span className="hidden md:block text-xs uppercase tracking-[0.22em] text-(--color-muted-fg)">
        NLC Burgdorf · Worship band
      </span>
      <Link
        href="/me"
        className="text-sm text-(--color-muted-fg) hover:text-(--color-accent) transition-colors"
      >
        {session.profile.display_name}
      </Link>
    </header>
  );
}
