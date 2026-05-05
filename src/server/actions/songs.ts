import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ValidationError } from '@/server/auth/errors';
import { requireRole, type Session } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSongInput, updateSongInput, songIdInput } from './songs.schemas';

export interface CreateSongDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    insert(row: Record<string, unknown>): Promise<{ id: string } & Record<string, unknown>>;
    writeAudit(input: { actorId: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown> }): Promise<void>;
  };
}

export function makeCreateSong(deps: CreateSongDeps) {
  return async function createSong(rawInput: z.input<typeof createSongInput>): Promise<{ id: string }> {
    const session = await deps.requireAdmin();
    const parsed = createSongInput.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const inserted = await deps.db.insert({
      ...parsed.data,
      created_by: session.profile.id,
      updated_by: session.profile.id,
    });
    await deps.db.writeAudit({
      actorId: session.profile.id,
      action: 'song.create',
      targetType: 'song',
      targetId: inserted.id,
      metadata: { title: parsed.data.title, language: parsed.data.language },
    });
    return { id: inserted.id };
  };
}

const realDeps: CreateSongDeps = {
  requireAdmin: () => requireRole('admin'),
  db: {
    async insert(row) {
      const sb = await createSupabaseServerClient();
      const { data, error } = await sb.from('songs').insert(row).select('id').single();
      if (error || !data) throw new Error(error?.message ?? 'insert failed');
      return data as { id: string };
    },
    async writeAudit({ actorId, action, targetType, targetId, metadata }) {
      const sb = createSupabaseAdminClient();
      const { error } = await sb.rpc('write_audit', {
        p_actor: actorId, p_action: action, p_target_type: targetType, p_target_id: targetId, p_metadata: metadata,
      });
      if (error) throw new Error(error.message);
    },
  },
};

export const createSong = makeCreateSong(realDeps);

export async function updateSong(id: string, rawInput: z.input<typeof updateSongInput>) {
  const session = await requireRole('admin');
  const parsedId = songIdInput.safeParse({ id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());
  const parsed = updateSongInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();
  const { error } = await sb
    .from('songs')
    .update({ ...parsed.data, updated_by: session.profile.id })
    .eq('id', id);
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id, p_action: 'song.update', p_target_type: 'song', p_target_id: id, p_metadata: {},
  });

  revalidatePath('/songs');
  revalidatePath(`/songs/${id}`);
}

export async function deleteSong(id: string) {
  const session = await requireRole('admin');
  const parsedId = songIdInput.safeParse({ id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());

  const sb = await createSupabaseServerClient();
  const { error } = await sb.from('songs').delete().eq('id', id);
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id, p_action: 'song.delete', p_target_type: 'song', p_target_id: id, p_metadata: {},
  });

  revalidatePath('/songs');
}

export async function listSongs() {
  await requireRole('admin', 'leader', 'musician');
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from('songs')
    .select('id, title, language, original_key, bpm, tags, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSong(id: string) {
  await requireRole('admin', 'leader', 'musician');
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from('songs').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data;
}
