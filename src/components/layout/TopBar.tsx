import Link from 'next/link';
import type { Session } from '@/server/auth/require';

export function TopBar({ session }: { session: Session }) {
  return (
    <header className="flex items-center justify-between border-b border-(--color-border) px-4 py-3 md:px-8">
      <Link href="/home" className="font-semibold tracking-tight">
        SongDrop
      </Link>
      <Link href="/me" className="text-sm text-(--color-muted-fg) hover:text-(--color-fg)">
        {session.profile.display_name}
      </Link>
    </header>
  );
}
