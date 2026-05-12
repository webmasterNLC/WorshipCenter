import 'server-only';

export interface PnwChordsSong {
  title: string;
  artist: string | null;
  original_key: string;
  body_chordpro: string;
  source_url: string;
}

const HOST = 'pnwchords.com';

const CHORD_TOKEN =
  /^[A-G](#|b)?(m|maj|sus|dim|aug|add)?\d*(\/[A-G](#|b)?)?$/;

// Header words we treat as section titles when they appear alone on a line.
const SECTION_LABEL =
  /^(intro|verse\s*\d*|pre[-\s]?chorus|chorus\s*\d*|bridge\s*\d*|outro|tag|interlude|refrain|coda|ending|instrumental|turnaround)\b/i;

/** Decode the small HTML entity subset pnwchords emits. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "’")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"');
}

function isChordLine(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  return trimmed.split(/\s+/).every((t) => CHORD_TOKEN.test(t));
}

/**
 * Take a chord line and the lyric line beneath it and weave the chords
 * inline at the right column positions, producing ChordPro:
 *
 *   "   D       A"           →  "Pra[D]ise the L[A]ord"
 *   "Praise the Lord"
 */
function mergeChordOverLyric(chord: string, lyric: string): string {
  // Pad lyric in case the chord line is longer than the lyric.
  const paddedLyric = lyric.padEnd(chord.length, ' ');
  let out = '';
  let i = 0;
  let lyricPos = 0;
  while (i < chord.length) {
    if (chord[i] !== ' ') {
      let j = i;
      while (j < chord.length && chord[j] !== ' ') j++;
      const tok = chord.slice(i, j);
      while (lyricPos < i) {
        out += paddedLyric[lyricPos];
        lyricPos++;
      }
      out += `[${tok}]`;
      i = j;
    } else {
      i++;
    }
  }
  if (lyricPos < paddedLyric.length) out += paddedLyric.slice(lyricPos);
  return out.trimEnd();
}

/** Convert a chord-above-lyric block into ChordPro inline notation. */
export function chordsToChordPro(body: string): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      out.push('');
      continue;
    }

    if (SECTION_LABEL.test(trimmed)) {
      out.push(`{comment: ${trimmed}}`);
      continue;
    }

    if (isChordLine(line)) {
      const next = lines[i + 1];
      if (
        next != null &&
        next.trim() !== '' &&
        !isChordLine(next) &&
        !SECTION_LABEL.test(next.trim())
      ) {
        out.push(mergeChordOverLyric(line, next));
        i++; // consume the lyric line
        continue;
      }
      // Standalone chord line (e.g. instrumental). Emit chords inline-only.
      const tokens = trimmed
        .split(/\s+/)
        .map((t) => `[${t}]`)
        .join(' ');
      out.push(tokens);
      continue;
    }

    out.push(line);
  }
  return out.join('\n').trim();
}

/** Pull the chord <pre> block out of the page HTML. */
function extractChordPre(html: string): string | null {
  // The page has tabbed content; the "Chords" tab's next <pre> holds the body.
  const m = html.match(
    /class="tabtitle"[^>]*>\s*Chords\s*<.*?<pre[^>]*>([\s\S]*?)<\/pre>/,
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

/** Best-effort: first chord token in the body is taken as the song's key. */
function inferKey(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    if (isChordLine(line)) {
      const first = line.trim().split(/\s+/)[0]!;
      // ChordPro key uses just root + optional 'm'; strip extensions like '7'.
      const m = first.match(/^([A-G](#|b)?m?)/);
      if (m) return m[1]!;
    }
  }
  return 'C';
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
