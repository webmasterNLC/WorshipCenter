// Sign-in attempt bookkeeping. The table has no RLS insert policy, so writes go
// through the service role; reads are gated by "auth_attempts: admin reads".
import 'server-only';
import { headers } from 'next/headers';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Vercel sets x-forwarded-for to "client, proxy1, proxy2" — the client is first.
 * The column is `inet`, which rejects anything malformed and would abort the
 * insert, so anything that doesn't look like an address becomes null.
 */
export function clientIpFrom(forwardedFor: string | null): string | null {
  const first = forwardedFor?.split(',')[0]?.trim();
  if (!first) return null;
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : null;
}

/**
 * Records one credential sign-in attempt. Never throws: bookkeeping must not
 * be able to lock anyone out.
 */
export async function recordAuthAttempt(email: string, succeeded: boolean): Promise<void> {
  try {
    const h = await headers();
    const sb = createSupabaseAdminClient();
    const { error } = await sb.from('auth_attempts').insert({
      email,
      ip: clientIpFrom(h.get('x-forwarded-for') ?? h.get('x-real-ip')),
      succeeded,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('[auth_attempts] insert failed:', e);
  }
}
