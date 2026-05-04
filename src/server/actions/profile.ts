'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ValidationError } from '@/server/auth/errors';
import { requireRole } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { updateMyProfileInput, adminSetUserRoleInput } from './profile.schemas';

export async function updateMyProfile(rawInput: z.input<typeof updateMyProfileInput>) {
  const session = await requireRole('admin', 'leader', 'musician');
  const parsed = updateMyProfileInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();
  const { error } = await sb
    .from('profiles')
    .update({ display_name: parsed.data.display_name })
    .eq('id', session.profile.id);
  if (error) throw new Error(error.message);

  revalidatePath('/me');
  revalidatePath('/home');
  return { ok: true };
}

export async function adminSetUserRole(rawInput: z.input<typeof adminSetUserRoleInput>) {
  const session = await requireRole('admin');
  const parsed = adminSetUserRoleInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  if (parsed.data.user_id === session.profile.id && parsed.data.role !== 'admin') {
    throw new ValidationError({ form: ['Cannot demote yourself.'] });
  }

  // Use the request-scoped server client for the role mutation so RLS still
  // enforces "admin updates roles" as the second wall — defense in depth.
  // The admin client is reserved for the audit RPC, which is service-role only.
  const sbServer = await createSupabaseServerClient();
  const { error } = await sbServer
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.user_id);
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'profile.role_change',
    p_target_type: 'profile',
    p_target_id: parsed.data.user_id,
    p_metadata: { new_role: parsed.data.role },
  });

  revalidatePath('/admin/users');
  return { ok: true };
}
