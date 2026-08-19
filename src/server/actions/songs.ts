import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ValidationError } from '@/server/auth/errors';
import { requireRole, type Session } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { transposeChordPro, semitonesBetweenKeys, detectKeyAccidental } from '@/lib/chordpro';
import {
  createSongInput,
  updateSongInput,
  songIdInput,
  transposeSongToKeyInput,
  type SongTranslationInput,
} from './songs.schemas';

export interface SongTranslation {
  id: string;
  language: 'de' | 'en' | 'ta';
  title: string;
  body_chordpro: string;
  is_primary: boolean;
}

interface SongRowFields {
  title: string;
  language: 'de' | 'en' | 'ta';
  body_chordpro: string;
  original_key: string;
  bpm?: number | undefined;
  time_signature?: string | undefined;
  notes?: string | undefined;
  tags: string[];
  created_by: string;
  updated_by: string;
}

export interface CreateSongDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    insertSong(row: SongRowFields): Promise<{ id: string }>;
    insertTranslations(
      rows: Array<SongTranslationInput & { song_id: string }>,
    ): Promise<void>;
    writeAudit(input: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      metadata: Record<string, unknown>;
    }): Promise<void>;
  };
}

export function makeCreateSong(deps: CreateSongDeps) {
  return async function createSong(
    rawInput: z.input<typeof createSongInput>,
  ): Promise<{ id: string }> {
    const session = await deps.requireAdmin();
    const parsed = createSongInput.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const primary = parsed.data.translations.find((t) => t.is_primary);
    if (!primary) {
      // Schema's superRefine already enforces this, but TS doesn't know.
      throw new ValidationError({ translations: ['No primary translation'] });
    }

    const inserted = await deps.db.insertSong({
      title: primary.title,
      language: primary.language,
      body_chordpro: primary.body_chordpro,
      original_key: parsed.data.original_key,
      bpm: parsed.data.bpm,
      time_signature: parsed.data.time_signature,
      notes: parsed.data.notes,
      tags: parsed.data.tags,
      created_by: session.profile.id,
      updated_by: session.profile.id,
    });

    await deps.db.insertTranslations(
      parsed.data.translations.map((t) => ({ ...t, song_id: inserted.id })),
    );

    await deps.db.writeAudit({
      actorId: session.profile.id,
      action: 'song.create',
      targetType: 'song',
      targetId: inserted.id,
      metadata: {
        title: primary.title,
        language: primary.language,
        translation_count: parsed.data.translations.length,
      },
    });
    return { id: inserted.id };
  };
}

const realDeps: CreateSongDeps = {
  requireAdmin: () => requireRole('admin'),
  db: {
    async insertSong(row) {
      const sb = await createSupabaseServerClient();
      const { data, error } = await sb
        .from('songs')
        .insert(row)
        .select('id')
        .single();
      if (error || !data) throw new Error(error?.message ?? 'insert failed');
      return data as { id: string };
    },
    async insertTranslations(rows) {
      if (rows.length === 0) return;
      const sb = await createSupabaseServerClient();
      const { error } = await sb.from('song_translations').insert(rows);
      if (error) throw new Error(error.message);
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

export const createSong = makeCreateSong(realDeps);

export async function updateSong(
  id: string,
  rawInput: z.input<typeof updateSongInput>,
) {
  const session = await requireRole('admin');
  const parsedId = songIdInput.safeParse({ id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());
  const parsed = updateSongInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();

  // Update song-level fields if any non-translation field was provided.
  const songFields: Record<string, unknown> = { updated_by: session.profile.id };
  if (parsed.data.original_key !== undefined) songFields.original_key = parsed.data.original_key;
  if (parsed.data.bpm !== undefined)            songFields.bpm = parsed.data.bpm;
  if (parsed.data.time_signature !== undefined) songFields.time_signature = parsed.data.time_signature;
  if (parsed.data.notes !== undefined)          songFields.notes = parsed.data.notes;
  if (parsed.data.tags !== undefined)           songFields.tags = parsed.data.tags;

  // Always update at least updated_by so updated_at trigger fires.
  const { error: songErr } = await sb.from('songs').update(songFields).eq('id', id);
  if (songErr) throw new Error(songErr.message);

  if (parsed.data.translations) {
    // Replace all translations atomically. The trigger then mirrors the new
    // primary's title/language/body_chordpro into the songs cache.
    const { error: delErr } = await sb
      .from('song_translations')
      .delete()
      .eq('song_id', id);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await sb
      .from('song_translations')
      .insert(
        parsed.data.translations.map((t) => ({
          song_id: id,
          language: t.language,
          title: t.title,
          body_chordpro: t.body_chordpro,
          is_primary: t.is_primary,
        })),
      );
    if (insErr) throw new Error(insErr.message);
  }

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'song.update',
    p_target_type: 'song',
    p_target_id: id,
    p_metadata: {
      translations_replaced: parsed.data.translations
        ? parsed.data.translations.length
        : 0,
    },
  });

  revalidatePath('/songs');
  revalidatePath(`/songs/${id}`);
}

export async function deleteSong(id: string) {
  const session = await requireRole('admin');
  const parsedId = songIdInput.safeParse({ id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());

  const sb = await createSupabaseServerClient();
  // song_translations are cascade-deleted via FK. The returned row is the only
  // chance to record the title — after this the audit log holds a bare UUID
  // that resolves to nothing.
  const { data: deleted, error } = await sb
    .from('songs')
    .delete()
    .eq('id', id)
    .select('title')
    .maybeSingle();
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'song.delete',
    p_target_type: 'song',
    p_target_id: id,
    p_metadata: deleted?.title ? { title: deleted.title } : {},
  });

  revalidatePath('/songs');
}

export interface SongListItem {
  id: string;
  title: string;
  language: 'de' | 'en' | 'ta';
  languages: Array<'de' | 'en' | 'ta'>;
  original_key: string;
  bpm: number | null;
  tags: string[];
  updated_at: string;
}

export async function listSongs(): Promise<SongListItem[]> {
  await requireRole('admin', 'leader', 'viewer');
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from('songs')
    .select(
      'id, title, language, original_key, bpm, tags, updated_at, song_translations(language)',
    )
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const trArr = row.song_translations as Array<{ language: string }> | null;
    const langs = (trArr ?? [])
      .map((t) => t.language as 'de' | 'en' | 'ta')
      .sort();
    return {
      id: row.id as string,
      title: row.title as string,
      language: row.language as 'de' | 'en' | 'ta',
      languages: langs.length > 0 ? langs : [row.language as 'de' | 'en' | 'ta'],
      original_key: row.original_key as string,
      bpm: (row.bpm as number | null) ?? null,
      tags: (row.tags as string[]) ?? [],
      updated_at: row.updated_at as string,
    };
  });
}

export interface SongDetail {
  id: string;
  title: string;
  language: 'de' | 'en' | 'ta';
  body_chordpro: string;
  original_key: string;
  /** Key the chart arrived in, before any rebase. Null = never rebased. */
  imported_key: string | null;
  bpm: number | null;
  time_signature: string | null;
  notes: string | null;
  tags: string[];
  updated_at: string;
  translations: SongTranslation[];
}

export async function getSong(id: string): Promise<SongDetail | null> {
  await requireRole('admin', 'leader', 'viewer');
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from('songs')
    .select(
      '*, song_translations(id, language, title, body_chordpro, is_primary)',
    )
    .eq('id', id)
    .single();
  if (error || !data) return null;

  const trArr = (data.song_translations ?? []) as Array<{
    id: string;
    language: 'de' | 'en' | 'ta';
    title: string;
    body_chordpro: string;
    is_primary: boolean;
  }>;

  // Sort: primary first, then by language code for stable order.
  const translations = [...trArr].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (b.is_primary && !a.is_primary) return 1;
    return a.language.localeCompare(b.language);
  });

  return {
    id: data.id as string,
    title: data.title as string,
    language: data.language as 'de' | 'en' | 'ta',
    body_chordpro: data.body_chordpro as string,
    original_key: data.original_key as string,
    imported_key: (data.imported_key as string | null) ?? null,
    bpm: (data.bpm as number | null) ?? null,
    time_signature: (data.time_signature as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    tags: (data.tags as string[]) ?? [],
    updated_at: data.updated_at as string,
    translations,
  };
}

// ---------------------------------------------------------------------------
// transposeSongToKey — rebase the stored chart into the band's key
// ---------------------------------------------------------------------------

/**
 * Rewrite a song's chart so it is stored in `key`.
 *
 * The viewer renders `body + transpose_semitones`, and a playlist row starts
 * at 0. So for "0 = the key we actually play" to hold, the stored chart itself
 * has to be in that key — relabelling `original_key` alone would leave the
 * chords where they were and make the label lie.
 *
 * Writes to song_translations, not to songs.body_chordpro: that column is a
 * cache the song_translations_sync_primary trigger overwrites from the primary
 * translation, so a write there would be silently reverted. Every language
 * shares the same chords, so all rows move together.
 */
export async function transposeSongToKey(rawInput: z.input<typeof transposeSongToKeyInput>) {
  const session = await requireRole('admin');
  const parsed = transposeSongToKeyInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const { id, key: targetKey } = parsed.data;

  const sb = await createSupabaseServerClient();

  const { data: song, error: songErr } = await sb
    .from('songs')
    .select('id, original_key, imported_key')
    .eq('id', id)
    .single();
  if (songErr || !song) throw new Error(songErr?.message ?? 'Song not found');

  const currentKey = song.original_key as string;
  const semitones = semitonesBetweenKeys(currentKey, targetKey);
  if (semitones === null) {
    throw new ValidationError({ key: [`Cannot transpose from ${currentKey} to ${targetKey}.`] });
  }
  if (semitones === 0) {
    return { ok: true, semitones: 0, from: currentKey, to: targetKey };
  }

  // Spell accidentals the way the *target* key would: rebasing into F should
  // produce Bb, not A#, regardless of what the source key preferred.
  const accidental = detectKeyAccidental(targetKey);

  const { data: translations, error: trErr } = await sb
    .from('song_translations')
    .select('id, body_chordpro')
    .eq('song_id', id);
  if (trErr) throw new Error(trErr.message);

  for (const tr of translations ?? []) {
    const { error } = await sb
      .from('song_translations')
      .update({ body_chordpro: transposeChordPro(tr.body_chordpro as string, semitones, accidental) })
      .eq('id', tr.id);
    if (error) throw new Error(error.message);
  }

  const { error: keyErr } = await sb
    .from('songs')
    .update({
      original_key: targetKey,
      // Record where the chart came from, once. A second rebase must not
      // overwrite this with an intermediate key.
      imported_key: (song.imported_key as string | null) ?? currentKey,
      updated_by: session.profile.id,
    })
    .eq('id', id);
  if (keyErr) throw new Error(keyErr.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'song.transpose',
    p_target_type: 'song',
    p_target_id: id,
    p_metadata: { from: currentKey, to: targetKey, semitones },
  });

  revalidatePath('/songs');
  revalidatePath(`/songs/${id}`);
  revalidatePath(`/songs/${id}/edit`);
  return { ok: true, semitones, from: currentKey, to: targetKey };
}
