'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ValidationError } from '@/server/auth/errors';
import { requireRole } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  updateMyProfileInput,
  adminSetUserRoleInput,
  toggleCapabilityInput,
  type Capability,
} from './profile.schemas';

export async function updateMyProfile(rawInput: z.input<typeof updateMyProfileInput>) {
  const session = await requireRole('admin', 'leader', 'viewer');
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

export async function toggleCapability(rawInput: z.input<typeof toggleCapabilityInput>) {
  const session = await requireRole('admin');
  const parsed = toggleCapabilityInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();
  if (parsed.data.enabled) {
    const { error } = await sb.from('profile_capabilities').upsert(
      { profile_id: parsed.data.user_id, capability: parsed.data.capability },
      { onConflict: 'profile_id,capability' },
    );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb
      .from('profile_capabilities')
      .delete()
      .eq('profile_id', parsed.data.user_id)
      .eq('capability', parsed.data.capability);
    if (error) throw new Error(error.message);
  }

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: parsed.data.enabled ? 'capability.grant' : 'capability.revoke',
    p_target_type: 'profile',
    p_target_id: parsed.data.user_id,
    p_metadata: { capability: parsed.data.capability },
  });

  revalidatePath('/admin/users');
  return { ok: true };
}

export interface MemberWithCapabilities {
  id: string;
  display_name: string;
  role: 'admin' | 'leader' | 'viewer';
  created_at: string;
  capabilities: Capability[];
}

export async function listMembersForAdmin(): Promise<MemberWithCapabilities[]> {
  await requireRole('admin');

  // Use admin client to bypass RLS for the listing — same pattern as
  // /admin/users uses today.
  const sb = createSupabaseAdminClient();

  const [{ data: profiles, error: profErr }, { data: caps, error: capErr }] =
    await Promise.all([
      sb.from('profiles')
        .select('id, display_name, role, created_at')
        .order('created_at', { ascending: false }),
      sb.from('profile_capabilities')
        .select('profile_id, capability'),
    ]);

  if (profErr) throw new Error(profErr.message);
  if (capErr) throw new Error(capErr.message);

  const capsByProfile = new Map<string, Capability[]>();
  for (const c of caps ?? []) {
    const arr = capsByProfile.get(c.profile_id) ?? [];
    arr.push(c.capability as Capability);
    capsByProfile.set(c.profile_id, arr);
  }

  return (profiles ?? []).map((p) => ({
    id: p.id,
    display_name: p.display_name,
    role: p.role as 'admin' | 'leader' | 'viewer',
    created_at: p.created_at,
    capabilities: capsByProfile.get(p.id) ?? [],
  }));
}
