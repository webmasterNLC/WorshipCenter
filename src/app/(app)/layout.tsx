import { redirect } from 'next/navigation';
import { loadSession } from '@/server/auth/require';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

// Every page under (app) reads the session via cookies(), so the whole subtree
// must render dynamically per request — opt out of build-time static analysis.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await loadSession();
  if (!session) redirect('/sign-in');
  return (
    <ThemeProvider>
      <AppShell session={session}>{children}</AppShell>
    </ThemeProvider>
  );
}
