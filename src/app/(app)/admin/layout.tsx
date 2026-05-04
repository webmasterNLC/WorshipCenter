import { redirect } from 'next/navigation';
import { loadSession } from '@/server/auth/require';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await loadSession();
  if (!session) redirect('/sign-in');
  if (session.profile.role !== 'admin') redirect('/home');
  return <div className="grid gap-6">{children}</div>;
}
