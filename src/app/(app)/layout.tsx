import { redirect } from 'next/navigation';
import { loadSession } from '@/server/auth/require';
import { AppShell } from '@/components/layout/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await loadSession();
  if (!session) redirect('/sign-in');
  return <AppShell session={session}>{children}</AppShell>;
}
