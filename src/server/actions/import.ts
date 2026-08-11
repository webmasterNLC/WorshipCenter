'use server';
import 'server-only';
import { z } from 'zod';

import { ValidationError } from '@/server/auth/errors';
import { requireRole } from '@/server/auth/require';
import { createSong } from './songs';
import { fetchPnwChordsSong } from '@/lib/import/pnwchords';
import { fetchUltimateGuitarSong } from '@/lib/import/ultimateguitar';

const importSongInput = z.object({
  url: z.string().trim().url(),
});

interface FetchedSong {
  title: string;
  artist: string | null;
  original_key: string;
  body_chordpro: string;
  source_url: string;
  capo?: number | null;
}

/** Route a URL to the importer that understands that host. */
async function fetchByHost(rawUrl: string): Promise<FetchedSong> {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    throw new ValidationError({ url: ['Not a valid URL.'] });
  }

  if (host === 'pnwchords.com') return fetchPnwChordsSong(rawUrl);
  if (host === 'ultimate-guitar.com' || host === 'tabs.ultimate-guitar.com') {
    return fetchUltimateGuitarSong(rawUrl);
  }
  throw new ValidationError({
    url: [`No importer for ${host}. Supported: pnwchords.com, ultimate-guitar.com.`],
  });
}

/**
 * Admin-only: fetch a song from a supported chord site, convert it to
 * ChordPro, create a Song row with one English translation, and return its id.
 * The caller usually redirects to /songs/{id}/edit so the admin can review and
 * tweak before declaring it ready.
 */
export async function importSongFromUrl(
  rawInput: z.input<typeof importSongInput>,
): Promise<{ id: string; title: string; original_key: string }> {
  await requireRole('admin');

  const parsed = importSongInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const fetched = await fetchByHost(parsed.data.url);

  // Persist the source URL in notes so the admin can re-check the original
  // later (and so the audit log shows where it came from). A capo matters to
  // whoever plays it and is not represented anywhere else in the model, so it
  // rides along here rather than being dropped.
  const sourceNote = [
    `Imported from ${fetched.source_url}`,
    fetched.artist ? `· ${fetched.artist}` : null,
    fetched.capo ? `· capo ${fetched.capo}` : null,
  ]
    .filter(Boolean)
    .join(' ');

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
