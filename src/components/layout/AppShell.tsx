import type { Session } from '@/server/auth/require';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { SideRail } from './SideRail';

export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-[240px_1fr]">
      <SideRail session={session} />
      <div className="flex min-h-dvh flex-col">
        <TopBar session={session} />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
        <BottomNav session={session} />
      </div>
    </div>
  );
}
