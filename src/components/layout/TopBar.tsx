import Link from 'next/link';
import type { Session } from '@/server/auth/require';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export function TopBar({ session }: { session: Session }) {
  return (
    // pt: the viewport is viewport-fit=cover, so without the inset the row of
    // controls sits under the notch / status bar. max() keeps the normal 0.75rem
    // on devices that report no inset (desktop, browser tabs with a URL bar).
    <header className="flex items-center justify-between gap-3 border-b border-(--color-border) px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:px-8">
      <Link
        href="/home"
        className="md:hidden flex items-center gap-2"
        aria-label="NLC Burgdorf WorshipCenter — Home"
      >
        {/* Beside the logo, not below it: the bar is one line tall. */}
        <span className="nlc-logo size-8" aria-hidden />
        <span className="font-display text-xs tracking-[0.18em] text-(--color-accent) uppercase">
          WorshipCenter
        </span>
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
