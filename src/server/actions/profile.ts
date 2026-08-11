import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ValidationError } from '@/server/auth/errors';
import { requireRole, type Session } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { appOrigin } from '@/lib/env';
import {
  updateMyProfileInput,
  adminSetUserRoleInput,
  toggleCapabilityInput,
  updateMyEmailInput,
  updateMyPasswordInput,
  adminUpdateUserDisplayNameInput,
  adminUpdateUserEmailInput,
  adminResetUserPasswordInput,
  adminDisableUserInput,
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

export interface ListMembersForAdminDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    fetchActiveMembers(): Promise<Array<{
      id: string;
      display_name: string;
      role: 'admin' | 'leader' | 'viewer';
      created_at: string;
    }>>;
    fetchCapabilities(): Promise<Array<{ profile_id: string; capability: Capability }>>;
  };
}

export function makeListMembersForAdmin(deps: ListMembersForAdminDeps) {
  return async function listMembersForAdmin(): Promise<MemberWithCapabilities[]> {
    await deps.requireAdmin();
    const [profiles, caps] = await Promise.all([
      deps.db.fetchActiveMembers(),
      deps.db.fetchCapabilities(),
    ]);

    const capsByProfile = new Map<string, Capability[]>();
    for (const c of caps) {
      const arr = capsByProfile.get(c.profile_id) ?? [];
      arr.push(c.capability);
      capsByProfile.set(c.profile_id, arr);
    }

    return profiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      role: p.role,
      created_at: p.created_at,
      capabilities: capsByProfile.get(p.id) ?? [],
    }));
  };
}

export async function listMembersForAdmin(): Promise<MemberWithCapabilities[]> {
  const sb = createSupabaseAdminClient();
  return makeListMembersForAdmin({
    requireAdmin: () => requireRole('admin'),
    db: {
      async fetchActiveMembers() {
        const { data, error } = await sb
          .from('profiles')
          .select('id, display_name, role, created_at')
          .is('disabled_at', null)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{
          id: string;
          display_name: string;
          role: 'admin' | 'leader' | 'viewer';
          created_at: string;
        }>;
      },
      async fetchCapabilities() {
        const { data, error } = await sb
          .from('profile_capabilities')
          .select('profile_id, capability');
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{ profile_id: string; capability: Capability }>;
      },
    },
  })();
}

// ===========================================================================
// Self-service account actions
// ===========================================================================

export async function updateMyEmail(rawInput: z.input<typeof updateMyEmailInput>) {
  const session = await requireRole('admin', 'leader', 'viewer');
  const parsed = updateMyEmailInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  // Supabase sends a confirmation email to the NEW address; the change isn't
  // active until that link is clicked. With "secure email change" enabled in
  // the Supabase dashboard, an email is also sent to the OLD address.
  // Point the confirmation link at /api/auth/callback so the PKCE code is
  // exchanged (the default would land on the site root, where nothing runs).
  const origin = appOrigin();
  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: `${origin}/api/auth/callback?next=/me` },
  );
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'profile.email_change_requested',
    p_target_type: 'profile',
    p_target_id: session.profile.id,
    p_metadata: { new_email: parsed.data.email },
  });

  revalidatePath('/me');
  return { ok: true };
}

export async function updateMyPassword(rawInput: z.input<typeof updateMyPasswordInput>) {
  const session = await requireRole('admin', 'leader', 'viewer');
  const parsed = updateMyPasswordInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.updateUser({ password: parsed.data.password });
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'profile.password_change',
    p_target_type: 'profile',
    p_target_id: session.profile.id,
    p_metadata: {},
  });

  revalidatePath('/me');
  return { ok: true };
}

// ===========================================================================
// Admin-managed account actions
// ===========================================================================

export async function adminUpdateUserDisplayName(
  rawInput: z.input<typeof adminUpdateUserDisplayNameInput>,
) {
  const session = await requireRole('admin');
  const parsed = adminUpdateUserDisplayNameInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();
  const { error } = await sb
    .from('profiles')
    .update({ display_name: parsed.data.display_name })
    .eq('id', parsed.data.user_id);
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'profile.display_name_change',
    p_target_type: 'profile',
    p_target_id: parsed.data.user_id,
    p_metadata: { new_display_name: parsed.data.display_name },
  });

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${parsed.data.user_id}`);
  return { ok: true };
}

export async function adminUpdateUserEmail(
  rawInput: z.input<typeof adminUpdateUserEmailInput>,
) {
  const session = await requireRole('admin');
  const parsed = adminUpdateUserEmailInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  // email_confirm: true skips the confirmation flow — admin sets it directly.
  const sbAdmin = createSupabaseAdminClient();
  const { error } = await sbAdmin.auth.admin.updateUserById(parsed.data.user_id, {
    email: parsed.data.email,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);

  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'profile.admin_email_change',
    p_target_type: 'profile',
    p_target_id: parsed.data.user_id,
    p_metadata: { new_email: parsed.data.email },
  });

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${parsed.data.user_id}`);
  return { ok: true };
}

export async function adminResetUserPassword(
  rawInput: z.input<typeof adminResetUserPasswordInput>,
) {
  const session = await requireRole('admin');
  const parsed = adminResetUserPasswordInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sbAdmin = createSupabaseAdminClient();
  const { error } = await sbAdmin.auth.admin.updateUserById(parsed.data.user_id, {
    password: parsed.data.password,
  });
  if (error) throw new Error(error.message);

  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'profile.admin_password_reset',
    p_target_type: 'profile',
    p_target_id: parsed.data.user_id,
    p_metadata: {},
  });

  revalidatePath(`/admin/users/${parsed.data.user_id}`);
  return { ok: true };
}

export interface AdminUserDetail {
  id: string;
  display_name: string;
  role: 'admin' | 'leader' | 'viewer';
  created_at: string;
  email: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  capabilities: Capability[];
}

export async function adminGetUserDetail(userId: string): Promise<AdminUserDetail | null> {
  await requireRole('admin');

  const sb = createSupabaseAdminClient();
  const [profileRes, capsRes, userRes] = await Promise.all([
    sb.from('profiles').select('id, display_name, role, created_at').eq('id', userId).maybeSingle(),
    sb.from('profile_capabilities').select('capability').eq('profile_id', userId),
    sb.auth.admin.getUserById(userId),
  ]);

  if (profileRes.error) throw new Error(profileRes.error.message);
  if (capsRes.error)    throw new Error(capsRes.error.message);
  if (!profileRes.data) return null;

  return {
    id: profileRes.data.id,
    display_name: profileRes.data.display_name,
    role: profileRes.data.role as 'admin' | 'leader' | 'viewer',
    created_at: profileRes.data.created_at,
    email: userRes.data.user?.email ?? null,
    email_confirmed_at: userRes.data.user?.email_confirmed_at ?? null,
    last_sign_in_at: userRes.data.user?.last_sign_in_at ?? null,
    capabilities: (capsRes.data ?? []).map((c) => c.capability as Capability),
  };
}

// ===========================================================================
// Soft-delete (deactivate) — one-way action
// ===========================================================================

export interface AdminDisableUserDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    getProfileRole(user_id: string): Promise<'admin' | 'leader' | 'viewer' | null>;
    countActiveAdmins(): Promise<number>;
    banUser(user_id: string, ban_duration: string): Promise<void>;
    markProfileDisabled(user_id: string, disabled_at_iso: string): Promise<void>;
    futurePlaylistIds(): Promise<string[]>;
    deleteAssignments(member_id: string, playlist_ids: string[]): Promise<void>;
    writeAudit(input: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      metadata: Record<string, unknown>;
    }): Promise<void>;
  };
}

const PERMANENT_BAN_DURATION = '876000h'; // ~100 years; Supabase has no 'infinity'

export function makeAdminDisableUser(deps: AdminDisableUserDeps) {
  return async function adminDisableUser(
    rawInput: z.input<typeof adminDisableUserInput>,
  ) {
    const session = await deps.requireAdmin();
    const parsed = adminDisableUserInput.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const { user_id } = parsed.data;

    if (user_id === session.profile.id) {
      throw new ValidationError({ form: ['Cannot disable yourself.'] });
    }

    const targetRole = await deps.db.getProfileRole(user_id);
    if (targetRole === 'admin') {
      const remaining = await deps.db.countActiveAdmins();
      if (remaining <= 1) {
        throw new ValidationError({
          form: ['Cannot disable the last active admin.'],
        });
      }
    }

    await deps.db.banUser(user_id, PERMANENT_BAN_DURATION);
    await deps.db.markProfileDisabled(user_id, new Date().toISOString());

    const playlistIds = await deps.db.futurePlaylistIds();
    await deps.db.deleteAssignments(user_id, playlistIds);

    await deps.db.writeAudit({
      actorId: session.profile.id,
      action: 'profile.disabled',
      targetType: 'profile',
      targetId: user_id,
      metadata: {},
    });

    return { ok: true };
  };
}

export async function adminDisableUser(
  rawInput: z.input<typeof adminDisableUserInput>,
) {
  const sbAdmin = createSupabaseAdminClient();
  const action = makeAdminDisableUser({
    requireAdmin: () => requireRole('admin'),
    db: {
      async getProfileRole(user_id) {
        const { data, error } = await sbAdmin
          .from('profiles')
          .select('role')
          .eq('id', user_id)
          .maybeSingle();
        if (error) throw new Error(`getProfileRole failed: ${error.message}`);
        return (data?.role ?? null) as 'admin' | 'leader' | 'viewer' | null;
      },
      async countActiveAdmins() {
        const { count, error } = await sbAdmin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')
          .is('disabled_at', null);
        if (error) throw new Error(`countActiveAdmins failed: ${error.message}`);
        return count ?? 0;
      },
      async banUser(user_id, ban_duration) {
        const { error } = await sbAdmin.auth.admin.updateUserById(user_id, {
          ban_duration,
        });
        if (error) throw new Error(`banUser failed: ${error.message}`);
      },
      async markProfileDisabled(user_id, disabled_at_iso) {
        const { error } = await sbAdmin
          .from('profiles')
          .update({ disabled_at: disabled_at_iso })
          .eq('id', user_id);
        if (error) throw new Error(`markProfileDisabled failed: ${error.message}`);
      },
      async futurePlaylistIds() {
        // playlists.scheduled_for is a date (not timestamptz), so compare to
        // YYYY-MM-DD — avoids timezone footguns and keeps the day boundary clean.
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await sbAdmin
          .from('playlists')
          .select('id')
          .gte('scheduled_for', today);
        if (error) throw new Error(`futurePlaylistIds failed: ${error.message}`);
        return (data ?? []).map((r) => r.id as string);
      },
      async deleteAssignments(member_id, playlist_ids) {
        if (playlist_ids.length === 0) return;
        const { error } = await sbAdmin
          .from('service_assignments')
          .delete()
          .eq('member_id', member_id)
          .in('playlist_id', playlist_ids);
        if (error) throw new Error(`deleteAssignments failed: ${error.message}`);
      },
      async writeAudit({ actorId, action, targetType, targetId, metadata }) {
        const { error } = await sbAdmin.rpc('write_audit', {
          p_actor: actorId,
          p_action: action,
          p_target_type: targetType,
          p_target_id: targetId,
          p_metadata: metadata,
        });
        if (error) throw new Error(`writeAudit failed: ${error.message}`);
      },
    },
  });
  const result = await action(rawInput);
  revalidatePath('/admin/users');
  return result;
}
