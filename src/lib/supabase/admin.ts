// Service-role Supabase client. BYPASSES Row Level Security.
// Use ONLY for narrowly-scoped operations that legitimately need it:
//   - creating auth users from validated invitation tokens
//   - writing audit_log rows
//   - rate-limit bookkeeping in auth_attempts
// Never import this file from a Client Component or non-server module.
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or URL missing — admin client cannot be created.');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
