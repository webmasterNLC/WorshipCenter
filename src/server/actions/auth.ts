'use server';
import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Sign the current user out: revoke the Supabase session and bounce to
 * /sign-in. Safe to call from any Server Component form action — the
 * server client clears the auth cookies on its way out.
 */
export async function signOutAction() {
  const sb = await createSupabaseServerClient();
  await sb.auth.signOut();
  redirect('/sign-in');
}
