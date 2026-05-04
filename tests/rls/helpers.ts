import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function admin(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Create a new auth user with a given role and return a per-user supabase client (acts as that user). */
export async function makeUser(role: 'admin'|'leader'|'musician'): Promise<{ id: string; sb: SupabaseClient }> {
  const a = admin();
  const email = `rls-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = 'rls-test-password-12+chars!';
  const { data, error } = await a.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  await a.from('profiles').upsert({ id: data.user.id, display_name: role, role });

  const sb = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { id: data.user.id, sb };
}

export async function cleanup(userIds: string[]) {
  const a = admin();
  for (const id of userIds) {
    await a.auth.admin.deleteUser(id);
  }
}
