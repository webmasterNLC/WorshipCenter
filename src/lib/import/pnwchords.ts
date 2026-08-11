import 'server-only';

import { chordsToChordPro, decodeEntities, inferKey } from './chords-to-chordpro';

export { chordsToChordPro } from './chords-to-chordpro';

export interface PnwChordsSong {
  title: string;
  artist: string | null;
  original_key: string;
  body_chordpro: string;
  source_url: string;
}

const HOST = 'pnwchords.com';

/** Pull the chord <pre> block out of the page HTML. */
function extractChordPre(html: string): string | null {
  // The page has tabbed content; the "Chords" tab's next <pre> holds the body.
  // Note: `.` doesn't match newlines in JS by default, so the gap between the
  // tab title and the <pre> must use [\s\S] (or the `s` flag) to span lines.
  const m = html.match(
    /class="tabtitle"[^>]*>\s*Chords\s*<[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/,
  );
  if (!m) return null;
  return decodeEntities(m[1]!.replace(/<[^>]+>/g, ''));
}

function extractTitleAndArtist(html: string): { title: string; artist: string | null } {
  // og:title is the most reliable: "Praise - Elevation Worship - pnwchords"
  const og = html.match(/<meta property="og:title" content="([^"]+)"/);
  const raw = og?.[1] ?? html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
  const cleaned = decodeEntities(raw)
    .replace(/\s*-\s*pnwchords\s*$/i, '')
    .replace(/\s+Chords\s*$/i, '')
    .trim();
  // Try splitting on en-dash, em-dash or hyphen surrounded by spaces.
  const parts = cleaned.split(/\s+[–—\-]\s+/);
  if (parts.length >= 2) {
    return { title: (parts[0] ?? '').trim(), artist: (parts[1] ?? '').trim() };
  }
  return { title: cleaned, artist: null };
}

/**
 * Fetch a pnwchords.com song page and return a parsed song ready to be
 * passed into createSong. Throws on unsupported URLs or unreachable pages.
 */
export async function fetchPnwChordsSong(rawUrl: string): Promise<PnwChordsSong> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Not a valid URL.');
  }
  if (url.hostname !== HOST && url.hostname !== `www.${HOST}`) {
    throw new Error(`Only ${HOST} URLs are supported right now.`);
  }

  const res = await fetch(url.toString(), {
    headers: {
      // Identify ourselves so the host can rate-limit / block if they want.
      'User-Agent':
        'NLC-Burgdorf-Songdrop/1.0 (+private worship-band internal use)',
      Accept: 'text/html,application/xhtml+xml',
    },
    // No caching — we want a fresh copy each import.
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`pnwchords returned ${res.status} for ${url.pathname}`);
  }
  const html = await res.text();

  const rawBody = extractChordPre(html);
  if (!rawBody) {
    throw new Error('Could not find the chord chart on that page.');
  }

  const { title, artist } = extractTitleAndArtist(html);
  const body_chordpro = chordsToChordPro(rawBody);
  const original_key = inferKey(rawBody);

  return {
    title: title || 'Untitled',
    artist,
    original_key,
    body_chordpro,
    source_url: url.toString(),
  };
}
