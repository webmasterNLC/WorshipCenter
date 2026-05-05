import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ValidationError, NotFoundError } from '@/server/auth/errors';
import { requireRole, requireOwnerOrAdmin, type Session } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { defaultMailer } from '@/lib/email/transport';
import { renderPlaylistShareEmail } from '@/lib/email/templates/playlist-share';
import {
  createPlaylistInput,
  updatePlaylistInput,
  playlistIdInput,
  addSongInput,
  updateItemInput,
  reorderInput,
  sharePlaylistInput,
} from './playlists.schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaylistRow {
  id: string;
  name: string;
  scheduled_for: string | null;
  description: string | null;
  owner_id: string;
  updated_at: string;
}

export interface PlaylistListItem {
  id: string;
  name: string;
  scheduled_for: string | null;
  updated_at: string;
  owner_id: string;
  owner_name: string | null;
  item_count: number;
}

export interface PlaylistItemRow {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
  transpose_semitones: number;
  capo: number | null;
  performance_notes: string | null;
  song: {
    id: string;
    title: string;
    language: string;
    original_key: string;
    bpm: number | null;
    time_signature: string | null;
    body_chordpro: string;
    notes: string | null;
  } | null;
}

export interface PlaylistDetail extends PlaylistRow {
  items: PlaylistItemRow[];
}

// ---------------------------------------------------------------------------
// Injectable deps for testable factory
// ---------------------------------------------------------------------------

export interface CreatePlaylistDeps {
  requireLeaderOrAdmin: () => Promise<Session>;
  db: {
    insertPlaylist(row: Record<string, unknown>): Promise<{ id: string }>;
    writeAudit(input: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      metadata: Record<string, unknown>;
    }): Promise<void>;
  };
}

export function makeCreatePlaylist(deps: CreatePlaylistDeps) {
  return async function createPlaylistImpl(
    rawInput: z.input<typeof createPlaylistInput>,
  ): Promise<{ id: string }> {
    const session = await deps.requireLeaderOrAdmin();
    const parsed = createPlaylistInput.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const inserted = await deps.db.insertPlaylist({
      name: parsed.data.name,
      scheduled_for: parsed.data.scheduled_for ?? null,
      description: parsed.data.description ?? null,
      owner_id: session.profile.id,
    });

    await deps.db.writeAudit({
      actorId: session.profile.id,
      action: 'playlist.create',
      targetType: 'playlist',
      targetId: inserted.id,
      metadata: { name: parsed.data.name },
    });

    return { id: inserted.id };
  };
}

const realCreatePlaylistDeps: CreatePlaylistDeps = {
  requireLeaderOrAdmin: () => requireRole('admin', 'leader'),
  db: {
    async insertPlaylist(row) {
      const sb = await createSupabaseServerClient();
      const { data, error } = await sb.from('playlists').insert(row).select('id').single();
      if (error || !data) throw new Error(error?.message ?? 'insert failed');
      return data as { id: string };
    },
    async writeAudit({ actorId, action, targetType, targetId, metadata }) {
      const sb = createSupabaseAdminClient();
      const { error } = await sb.rpc('write_audit', {
        p_actor: actorId,
        p_action: action,
        p_target_type: targetType,
        p_target_id: targetId,
        p_metadata: metadata,
      });
      if (error) throw new Error(error.message);
    },
  },
};

export const createPlaylist = makeCreatePlaylist(realCreatePlaylistDeps);

// ---------------------------------------------------------------------------
// updatePlaylist
// ---------------------------------------------------------------------------

export async function updatePlaylist(
  id: string,
  rawInput: z.input<typeof updatePlaylistInput>,
) {
  const session = await requireOwnerOrAdmin(id);
  const parsedId = playlistIdInput.safeParse({ id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());
  const parsed = updatePlaylistInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.scheduled_for !== undefined) updates.scheduled_for = parsed.data.scheduled_for;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  const { error } = await sb.from('playlists').update(updates).eq('id', id);
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'playlist.update',
    p_target_type: 'playlist',
    p_target_id: id,
    p_metadata: {},
  });

  revalidatePath('/playlists');
  revalidatePath(`/playlists/${id}`);
}

// ---------------------------------------------------------------------------
// deletePlaylist
// ---------------------------------------------------------------------------

export async function deletePlaylist(id: string) {
  const session = await requireOwnerOrAdmin(id);
  const parsedId = playlistIdInput.safeParse({ id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());

  const sb = await createSupabaseServerClient();
  const { error } = await sb.from('playlists').delete().eq('id', id);
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'playlist.delete',
    p_target_type: 'playlist',
    p_target_id: id,
    p_metadata: {},
  });

  revalidatePath('/playlists');
}

// ---------------------------------------------------------------------------
// listPlaylists
// ---------------------------------------------------------------------------

export async function listPlaylists(): Promise<PlaylistListItem[]> {
  await requireRole('admin', 'leader', 'musician');
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from('playlists')
    .select(
      'id, name, scheduled_for, updated_at, owner_id, owner:profiles(display_name), playlist_items(count)',
    )
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const ownerArr = row.owner as Array<{ display_name: string }> | { display_name: string } | null;
    let ownerName: string | null = null;
    if (Array.isArray(ownerArr)) {
      ownerName = ownerArr[0]?.display_name ?? null;
    } else if (ownerArr && typeof ownerArr === 'object') {
      ownerName = (ownerArr as { display_name: string }).display_name ?? null;
    }

    const itemsArr = row.playlist_items as Array<{ count: number }> | null;
    const itemCount =
      Array.isArray(itemsArr) && itemsArr[0] != null
        ? Number(itemsArr[0].count)
        : 0;

    return {
      id: row.id,
      name: row.name,
      scheduled_for: row.scheduled_for ?? null,
      updated_at: row.updated_at,
      owner_id: row.owner_id,
      owner_name: ownerName,
      item_count: itemCount,
    };
  });
}

// ---------------------------------------------------------------------------
// getPlaylist
// ---------------------------------------------------------------------------

export async function getPlaylist(id: string): Promise<PlaylistDetail | null> {
  await requireRole('admin', 'leader', 'musician');
  const parsedId = playlistIdInput.safeParse({ id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());

  const sb = await createSupabaseServerClient();
  const { data: playlist, error: plErr } = await sb
    .from('playlists')
    .select('id, name, scheduled_for, description, owner_id, updated_at')
    .eq('id', id)
    .single();
  if (plErr || !playlist) return null;

  const { data: items, error: itemsErr } = await sb
    .from('playlist_items')
    .select(
      'id, playlist_id, song_id, position, transpose_semitones, capo, performance_notes, song:songs(id, title, language, original_key, bpm, time_signature, body_chordpro, notes)',
    )
    .eq('playlist_id', id)
    .order('position', { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  const typedItems: PlaylistItemRow[] = (items ?? []).map((item) => {
    const songData = item.song as
      | {
          id: string;
          title: string;
          language: string;
          original_key: string;
          bpm: number | null;
          time_signature: string | null;
          body_chordpro: string;
          notes: string | null;
        }
      | Array<{
          id: string;
          title: string;
          language: string;
          original_key: string;
          bpm: number | null;
          time_signature: string | null;
          body_chordpro: string;
          notes: string | null;
        }>
      | null;

    const song = Array.isArray(songData) ? (songData[0] ?? null) : songData;

    return {
      id: item.id,
      playlist_id: item.playlist_id,
      song_id: item.song_id,
      position: item.position,
      transpose_semitones: item.transpose_semitones ?? 0,
      capo: item.capo ?? null,
      performance_notes: item.performance_notes ?? null,
      song: song ?? null,
    };
  });

  return {
    id: playlist.id,
    name: playlist.name,
    scheduled_for: playlist.scheduled_for ?? null,
    description: playlist.description ?? null,
    owner_id: playlist.owner_id,
    updated_at: playlist.updated_at,
    items: typedItems,
  };
}

// ---------------------------------------------------------------------------
// addSongToPlaylist
// ---------------------------------------------------------------------------

export async function addSongToPlaylist(rawInput: z.input<typeof addSongInput>) {
  const parsed = addSongInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  await requireOwnerOrAdmin(parsed.data.playlist_id);

  const sb = await createSupabaseServerClient();

  // Compute next position
  const { data: maxRow } = await sb
    .from('playlist_items')
    .select('position')
    .eq('playlist_id', parsed.data.playlist_id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const nextPosition = maxRow ? maxRow.position + 1 : 0;

  const { data, error } = await sb
    .from('playlist_items')
    .insert({
      playlist_id: parsed.data.playlist_id,
      song_id: parsed.data.song_id,
      position: nextPosition,
      transpose_semitones: parsed.data.transpose_semitones,
      capo: parsed.data.capo ?? null,
      performance_notes: parsed.data.performance_notes ?? null,
    })
    .select('id, playlist_id, song_id, position, transpose_semitones, capo, performance_notes')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'insert failed');

  revalidatePath(`/playlists/${parsed.data.playlist_id}`);
  revalidatePath(`/playlists/${parsed.data.playlist_id}/edit`);

  return data;
}

// ---------------------------------------------------------------------------
// removePlaylistItem
// ---------------------------------------------------------------------------

export async function removePlaylistItem(itemId: string) {
  const parsedId = playlistIdInput.safeParse({ id: itemId });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());

  const sb = await createSupabaseServerClient();

  // First fetch the item to get playlist_id + position
  const { data: item, error: fetchErr } = await sb
    .from('playlist_items')
    .select('id, playlist_id, position')
    .eq('id', itemId)
    .single();
  if (fetchErr || !item) throw new NotFoundError('PlaylistItem');

  await requireOwnerOrAdmin(item.playlist_id);

  // Delete the item
  const { error: delErr } = await sb.from('playlist_items').delete().eq('id', itemId);
  if (delErr) throw new Error(delErr.message);

  // Compact positions: decrement all items with position > removed.position
  const { data: following } = await sb
    .from('playlist_items')
    .select('id, position')
    .eq('playlist_id', item.playlist_id)
    .gt('position', item.position);

  for (const f of following ?? []) {
    await sb
      .from('playlist_items')
      .update({ position: f.position - 1 })
      .eq('id', f.id);
  }

  revalidatePath(`/playlists/${item.playlist_id}`);
  revalidatePath(`/playlists/${item.playlist_id}/edit`);
}

// ---------------------------------------------------------------------------
// updatePlaylistItem
// ---------------------------------------------------------------------------

export async function updatePlaylistItem(rawInput: z.input<typeof updateItemInput>) {
  const parsed = updateItemInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();

  // Fetch item to get playlist_id for auth check
  const { data: item, error: fetchErr } = await sb
    .from('playlist_items')
    .select('id, playlist_id')
    .eq('id', parsed.data.id)
    .single();
  if (fetchErr || !item) throw new NotFoundError('PlaylistItem');

  await requireOwnerOrAdmin(item.playlist_id);

  const updates: Record<string, unknown> = {};
  if (parsed.data.transpose_semitones !== undefined) {
    updates.transpose_semitones = parsed.data.transpose_semitones;
  }
  if (parsed.data.capo !== undefined) updates.capo = parsed.data.capo;
  if (parsed.data.performance_notes !== undefined) {
    updates.performance_notes = parsed.data.performance_notes;
  }

  const { error } = await sb.from('playlist_items').update(updates).eq('id', parsed.data.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/playlists/${item.playlist_id}`);
  revalidatePath(`/playlists/${item.playlist_id}/edit`);
}

// ---------------------------------------------------------------------------
// reorderPlaylistItems
// ---------------------------------------------------------------------------

export async function reorderPlaylistItems(rawInput: z.input<typeof reorderInput>) {
  const parsed = reorderInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  await requireOwnerOrAdmin(parsed.data.playlist_id);

  const sb = await createSupabaseServerClient();

  // Update each item serially with its new position (index in the ordered list)
  for (let i = 0; i < parsed.data.ordered_item_ids.length; i++) {
    const id = parsed.data.ordered_item_ids[i];
    if (!id) continue;
    await sb.from('playlist_items').update({ position: i }).eq('id', id);
  }

  revalidatePath(`/playlists/${parsed.data.playlist_id}`);
  revalidatePath(`/playlists/${parsed.data.playlist_id}/edit`);
}

// ---------------------------------------------------------------------------
// savePlaylistVersion
// ---------------------------------------------------------------------------

export async function savePlaylistVersion(playlist_id: string) {
  const session = await requireOwnerOrAdmin(playlist_id);
  const parsedId = playlistIdInput.safeParse({ id: playlist_id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());

  const playlist = await getPlaylist(playlist_id);
  if (!playlist) throw new NotFoundError('Playlist');

  const sb = await createSupabaseServerClient();

  // Compute next version number
  const { data: vRow } = await sb
    .from('playlist_versions')
    .select('version')
    .eq('playlist_id', playlist_id)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = vRow ? vRow.version + 1 : 1;

  const { error } = await sb.from('playlist_versions').insert({
    playlist_id,
    version: nextVersion,
    snapshot: JSON.parse(JSON.stringify(playlist)) as Record<string, unknown>,
    saved_by: session.profile.id,
  });
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'playlist.version_save',
    p_target_type: 'playlist',
    p_target_id: playlist_id,
    p_metadata: { version: nextVersion },
  });

  revalidatePath(`/playlists/${playlist_id}`);
}

// ---------------------------------------------------------------------------
// sharePlaylist
// ---------------------------------------------------------------------------

export async function sharePlaylist(rawInput: z.input<typeof sharePlaylistInput>) {
  const parsed = sharePlaylistInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const session = await requireOwnerOrAdmin(parsed.data.playlist_id);

  const sb = await createSupabaseServerClient();

  // Get playlist
  const { data: playlist, error: plErr } = await sb
    .from('playlists')
    .select('id, name, scheduled_for')
    .eq('id', parsed.data.playlist_id)
    .single();
  if (plErr || !playlist) throw new NotFoundError('Playlist');

  // Get all band members
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, display_name, role')
    .in('role', ['admin', 'leader', 'musician']);
  if (profErr) throw new Error(profErr.message);

  const recipients = (profiles ?? []).filter((p) => p.id !== session.profile.id);

  const appOrigin = process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const url = `${appOrigin}/playlists/${parsed.data.playlist_id}`;

  const mailer = defaultMailer();

  const { subject, html, text } = renderPlaylistShareEmail({
    senderName: session.profile.display_name,
    playlistName: playlist.name,
    scheduledFor: playlist.scheduled_for ?? null,
    message: parsed.data.message ?? null,
    url,
  });

  for (const recipient of recipients) {
    // We don't have email in profiles — use auth admin API to get user email
    const sbAdmin = createSupabaseAdminClient();
    const { data: userResp } = await sbAdmin.auth.admin.getUserById(recipient.id);
    const email = userResp?.user?.email;
    if (!email) continue;
    await mailer.send({ to: email, subject, html, text });
  }

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'playlist.share_sent',
    p_target_type: 'playlist',
    p_target_id: parsed.data.playlist_id,
    p_metadata: {
      recipient_count: recipients.length,
      message_preview: parsed.data.message?.slice(0, 100) ?? null,
    },
  });

  revalidatePath(`/playlists/${parsed.data.playlist_id}`);

  return { recipient_count: recipients.length };
}
