import { redirect } from 'next/navigation';
import { loadSession } from '@/server/auth/require';

export default async function RootPage() {
  const session = await loadSession();
  redirect(session ? '/home' : '/sign-in');
}
