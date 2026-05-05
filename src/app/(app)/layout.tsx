import { redirect } from 'next/navigation';
import { loadSession } from '@/server/auth/require';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await loadSession();
  if (!session) redirect('/sign-in');
  return (
    <ThemeProvider>
      <AppShell session={session}>{children}</AppShell>
    </ThemeProvider>
  );
}
