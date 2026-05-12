import Link from 'next/link';
import type { Session } from '@/server/auth/require';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export function TopBar({ session }: { session: Session }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-(--color-border) px-4 py-3 md:px-8">
      <Link href="/home" className="md:hidden flex items-baseline gap-1">
        <span className="font-display-tight text-xl">Song</span>
        <span className="font-display-tight text-xl italic text-(--color-accent)">drop</span>
      </Link>
      {/* Desktop spacer — keeps the right-hand controls aligned. */}
      <span className="hidden md:block" />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Link
          href="/me"
          className="text-sm text-(--color-muted-fg) hover:text-(--color-accent) transition-colors"
        >
          {session.profile.display_name}
        </Link>
      </div>
    </header>
  );
}
