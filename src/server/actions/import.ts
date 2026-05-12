'use server';
import 'server-only';
import { z } from 'zod';

import { ValidationError } from '@/server/auth/errors';
import { requireRole } from '@/server/auth/require';
import { createSong } from './songs';
import { fetchPnwChordsSong } from '@/lib/import/pnwchords';

const importPnwChordsInput = z.object({
  url: z.string().trim().url(),
});

/**
 * Admin-only: fetch a song from pnwchords.com, convert to ChordPro,
 * create a Song row with one English translation, and return its id.
 * The caller usually redirects to /songs/{id}/edit so the admin can
 * review and tweak before declaring it ready.
 */
export async function importPnwChordsSong(
  rawInput: z.input<typeof importPnwChordsInput>,
): Promise<{ id: string; title: string; original_key: string }> {
  await requireRole('admin');

  const parsed = importPnwChordsInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const fetched = await fetchPnwChordsSong(parsed.data.url);

  // Persist the source URL in notes so the admin can re-check the
  // original later (and so the audit log shows where it came from).
  const sourceNote = `Imported from ${fetched.source_url}${
    fetched.artist ? ` · ${fetched.artist}` : ''
  }`;

  const created = await createSong({
    original_key: fetched.original_key,
    notes: sourceNote,
    tags: [],
    translations: [
      {
        language: 'en',
        title: fetched.title,
        body_chordpro: fetched.body_chordpro,
        is_primary: true,
      },
    ],
  });

  return {
    id: created.id,
    title: fetched.title,
    original_key: fetched.original_key,
  };
}
