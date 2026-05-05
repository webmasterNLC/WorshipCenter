'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ValidationError, NotFoundError } from '@/server/auth/errors';
import { requireRole, requireOwnerOrAdmin } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  assignToServiceInput,
  unassignFromServiceInput,
  type RotaRole,
} from './service.schemas';
import type { Capability } from './profile.schemas';

export interface RotaAssignment {
  id: string;
  role: RotaRole;
  member_id: string;
  member_name: string;
  notes: string | null;
}

export interface RotaCandidate {
  id: string;
  display_name: string;
  capabilities: Capability[];
}

/**
 * Assign a member to a role on a playlist's rota.
 * Requires the caller to be the playlist owner or an admin.
 * Validates that the member has the corresponding capability.
 */
export async function assignToService(
  rawInput: z.input<typeof assignToServiceInput>,
) {
  const parsed = assignToServiceInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const session = await requireOwnerOrAdmin(parsed.data.playlist_id);

  const sb = await createSupabaseServerClient();

  // Capability gate: the member must be allowed to play this role.
  const { data: cap, error: capErr } = await sb
    .from('profile_capabilities')
    .select('capability')
    .eq('profile_id', parsed.data.member_id)
    .eq('capability', parsed.data.role)
    .maybeSingle();
  if (capErr) throw new Error(capErr.message);
  if (!cap) {
    throw new ValidationError({
      member_id: ['Member is not capable of this role.'],
    });
  }

  const { error } = await sb.from('service_assignments').upsert(
    {
      playlist_id: parsed.data.playlist_id,
      role:        parsed.data.role,
      member_id:   parsed.data.member_id,
      notes:       parsed.data.notes ?? null,
      assigned_by: session.profile.id,
    },
    { onConflict: 'playlist_id,role,member_id' },
  );
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'rota.assign',
    p_target_type: 'playlist',
    p_target_id: parsed.data.playlist_id,
    p_metadata: {
      role: parsed.data.role,
      member_id: parsed.data.member_id,
    },
  });

  revalidatePath(`/playlists/${parsed.data.playlist_id}`);
  revalidatePath('/home');
  return { ok: true };
}

export async function unassignFromService(
  rawInput: z.input<typeof unassignFromServiceInput>,
) {
  const parsed = unassignFromServiceInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const session = await requireOwnerOrAdmin(parsed.data.playlist_id);

  const sb = await createSupabaseServerClient();
  const { error } = await sb
    .from('service_assignments')
    .delete()
    .eq('playlist_id', parsed.data.playlist_id)
    .eq('role', parsed.data.role)
    .eq('member_id', parsed.data.member_id);
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'rota.unassign',
    p_target_type: 'playlist',
    p_target_id: parsed.data.playlist_id,
    p_metadata: {
      role: parsed.data.role,
      member_id: parsed.data.member_id,
    },
  });

  revalidatePath(`/playlists/${parsed.data.playlist_id}`);
  revalidatePath('/home');
  return { ok: true };
}

export async function getServiceAssignments(
  playlistId: string,
): Promise<RotaAssignment[]> {
  await requireRole('admin', 'leader', 'viewer');
  const sb = await createSupabaseServerClient();

  const { data, error } = await sb
    .from('service_assignments')
    .select(
      'id, role, member_id, notes, member:profiles!member_id(display_name)',
    )
    .eq('playlist_id', playlistId);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const m = row.member as
      | Array<{ display_name: string }>
      | { display_name: string }
      | null;
    let memberName = 'Unknown';
    if (Array.isArray(m)) memberName = m[0]?.display_name ?? 'Unknown';
    else if (m && typeof m === 'object') memberName = m.display_name ?? 'Unknown';
    return {
      id: row.id as string,
      role: row.role as RotaRole,
      member_id: row.member_id as string,
      member_name: memberName,
      notes: (row.notes as string | null) ?? null,
    };
  });
}

/**
 * All band members + their capabilities. The picker filters this list per
 * role at render time. Only callable by playlist owner or admin (since they
 * are the ones who can assign).
 */
export async function getRotaCandidates(
  playlistId: string,
): Promise<RotaCandidate[]> {
  await requireOwnerOrAdmin(playlistId);

  // Use admin client to bypass RLS for the listing — same pattern as
  // listMembersForAdmin().
  const sb = createSupabaseAdminClient();
  const [{ data: profiles, error: profErr }, { data: caps, error: capErr }] =
    await Promise.all([
      sb.from('profiles').select('id, display_name').order('display_name'),
      sb.from('profile_capabilities').select('profile_id, capability'),
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
    id: p.id as string,
    display_name: p.display_name as string,
    capabilities: capsByProfile.get(p.id) ?? [],
  }));
}

export interface MyDuty {
  playlist_id: string;
  playlist_name: string;
  scheduled_for: string;
  role: RotaRole;
}

/**
 * Upcoming services where the current user is on the rota.
 * Returns soonest first.
 */
export async function getMyUpcomingDuties(limit = 5): Promise<MyDuty[]> {
  const session = await requireRole('admin', 'leader', 'viewer');
  const sb = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await sb
    .from('service_assignments')
    .select('role, playlist:playlists(id, name, scheduled_for)')
    .eq('member_id', session.profile.id);
  if (error) throw new Error(error.message);

  const out: MyDuty[] = [];
  for (const row of data ?? []) {
    const p = row.playlist as
      | Array<{ id: string; name: string; scheduled_for: string | null }>
      | { id: string; name: string; scheduled_for: string | null }
      | null;
    const playlist = Array.isArray(p) ? p[0] : p;
    if (!playlist || !playlist.scheduled_for) continue;
    if (playlist.scheduled_for < today) continue;
    out.push({
      playlist_id: playlist.id,
      playlist_name: playlist.name,
      scheduled_for: playlist.scheduled_for,
      role: row.role as RotaRole,
    });
  }

  out.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  return out.slice(0, limit);
}

/**
 * Notify the rota for a playlist by email — replaces the broadcast share.
 * Sends to members assigned to the playlist's service_assignments.
 */
export async function notifyRota(playlistId: string, message?: string) {
  if (!playlistId.match(/^[0-9a-f-]{36}$/i)) {
    throw new ValidationError({ playlist_id: ['Invalid id'] });
  }
  const session = await requireOwnerOrAdmin(playlistId);

  const sb = await createSupabaseServerClient();

  const { data: playlist, error: plErr } = await sb
    .from('playlists')
    .select('id, name, scheduled_for')
    .eq('id', playlistId)
    .single();
  if (plErr || !playlist) throw new NotFoundError('Playlist');

  const { data: assignments, error: aErr } = await sb
    .from('service_assignments')
    .select('member_id, role, member:profiles!member_id(display_name)')
    .eq('playlist_id', playlistId);
  if (aErr) throw new Error(aErr.message);

  const recipients = (assignments ?? []).filter(
    (a) => a.member_id !== session.profile.id,
  );

  const sbAdmin = createSupabaseAdminClient();
  const appOrigin =
    process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const url = `${appOrigin}/playlists/${playlistId}`;

  // Lazy-load the mailer + template so unit tests don't transitively pull
  // nodemailer into happy-dom.
  const [{ defaultMailer }, { renderPlaylistShareEmail }] = await Promise.all([
    import('@/lib/email/transport'),
    import('@/lib/email/templates/playlist-share'),
  ]);
  const mailer = defaultMailer();
  const { subject, html, text } = renderPlaylistShareEmail({
    senderName: session.profile.display_name,
    playlistName: playlist.name,
    scheduledFor: playlist.scheduled_for ?? null,
    message: message ?? null,
    url,
  });

  let sent = 0;
  for (const a of recipients) {
    const { data: userResp } = await sbAdmin.auth.admin.getUserById(a.member_id);
    const email = userResp?.user?.email;
    if (!email) continue;
    await mailer.send({ to: email, subject, html, text });
    sent += 1;
  }

  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'rota.notify',
    p_target_type: 'playlist',
    p_target_id: playlistId,
    p_metadata: {
      recipient_count: sent,
      message_preview: message?.slice(0, 100) ?? null,
    },
  });

  revalidatePath(`/playlists/${playlistId}`);
  return { recipient_count: sent };
}
