import 'server-only';

import { chordsToChordPro, decodeEntities, inferKey } from './chords-to-chordpro';

export interface UltimateGuitarSong {
  title: string;
  artist: string | null;
  original_key: string;
  /** Fret the chart is written for, if the submitter used one. */
  capo: number | null;
  body_chordpro: string;
  source_url: string;
}

const HOSTS = new Set([
  'tabs.ultimate-guitar.com',
  'www.ultimate-guitar.com',
  'ultimate-guitar.com',
]);

/**
 * Ultimate Guitar renders client-side: the whole page model sits in a single
 * `data-content` attribute as HTML-escaped JSON, and the visible HTML is built
 * from it in the browser. So there is no chord markup to scrape — we read the
 * model directly, which is both sturdier and less work than parsing the DOM.
 */
function extractStore(html: string): unknown {
  const m = html.match(/class="js-store"\s+data-content="([^"]*)"/);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(decodeEntities(m[1]));
  } catch {
    return null;
  }
}

/** Walk a path through parsed JSON without assuming any of it exists. */
function dig(value: unknown, ...path: string[]): unknown {
  let cur = value;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Narrow the parts of the store we rely on, without trusting its shape. */
function readTabData(store: unknown): {
  content: string;
  songName: string;
  artistName: string;
  tonality: string;
  type: string;
  capo: number | null;
} | null {
  const data = dig(store, 'store', 'page', 'data');
  if (data === undefined) return null;

  const content = dig(data, 'tab_view', 'wiki_tab', 'content');
  if (typeof content !== 'string' || content.trim() === '') return null;

  const capo = dig(data, 'tab_view', 'meta', 'capo');
  return {
    content,
    songName: str(dig(data, 'tab', 'song_name')),
    artistName: str(dig(data, 'tab', 'artist_name')),
    tonality:
      str(dig(data, 'tab', 'tonality_name')) ||
      str(dig(data, 'tab_view', 'meta', 'tonality')),
    type: str(dig(data, 'tab', 'type')),
    capo: typeof capo === 'number' && capo > 0 ? capo : null,
  };
}

/**
 * Strip Ultimate Guitar's own markup, leaving the plain monospace grid that
 * chordsToChordPro expects.
 *
 * `[ch]G[/ch]` marks a chord and `[tab]...[/tab]` wraps an aligned block. The
 * spacing around the markers is *display* spacing — it already accounts for
 * the markers being invisible — so removing them leaves chord columns sitting
 * exactly above the syllable they belong to.
 */
export function stripUgMarkup(content: string): string {
  return (
    content
      .replace(/\r\n/g, '\n')
      .replace(/\[\/?tab\]/g, '')
      .replace(/\[ch\]([^[]*)\[\/ch\]/g, '$1')
      // Section headers arrive as "[Intro]". Left alone they would survive into
      // the body as ChordPro chord brackets — a chord literally named "Intro",
      // which the transposer would then try to parse. Once the chord markers
      // above are gone, a line that is nothing but brackets can only be a
      // header, so unwrapping it here is unambiguous; the shared converter then
      // turns the recognised ones into {comment: ...}.
      .replace(/^[ \t]*\[([^\]\n]+)\][ \t]*$/gm, '$1')
  );
}

/**
 * A key name we are willing to store. Ultimate Guitar mostly reports plain
 * roots ("C", "Am", "F#"), but the field is submitter-influenced, so anything
 * unexpected falls back to reading the chart itself rather than failing the
 * whole import over metadata.
 */
function normaliseKey(tonality: string, body: string): string {
  const m = tonality.trim().match(/^([A-G](#|b)?m?)$/);
  return m ? m[1]! : inferKey(body);
}

/**
 * Fetch an Ultimate Guitar chords page and return a song ready for createSong.
 *
 * Only "Chords" tabs are accepted. Guitar Pro and Power Tab entries are binary
 * downloads, and Bass/Ukulele/Drum tabs are fret grids — none of them convert
 * to a chord chart, and silently importing the resulting noise would be worse
 * than refusing.
 */
export async function fetchUltimateGuitarSong(rawUrl: string): Promise<UltimateGuitarSong> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Not a valid URL.');
  }
  if (!HOSTS.has(url.hostname)) {
    throw new Error('Only ultimate-guitar.com URLs are supported here.');
  }

  const res = await fetch(url.toString(), {
    headers: {
      // Identify ourselves so the host can rate-limit or block if they want.
      'User-Agent':
        'NLC-Burgdorf-WorshipCenter/1.0 (+private worship-band internal use)',
      Accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });
  if (res.status === 404) {
    throw new Error('That Ultimate Guitar page does not exist.');
  }
  if (!res.ok) {
    throw new Error(`Ultimate Guitar returned ${res.status}.`);
  }
  const html = await res.text();

  const tab = readTabData(extractStore(html));
  if (!tab) {
    throw new Error(
      'Could not read the chart from that page. Ultimate Guitar may have changed its page format.',
    );
  }
  if (tab.type && tab.type !== 'Chords') {
    throw new Error(
      `That is a "${tab.type}" page. Only chord charts can be imported — look for the Chords version of the song.`,
    );
  }

  const plain = stripUgMarkup(tab.content);
  const body_chordpro = chordsToChordPro(plain);

  return {
    title: tab.songName || 'Untitled',
    artist: tab.artistName || null,
    original_key: normaliseKey(tab.tonality, plain),
    capo: tab.capo,
    body_chordpro,
    source_url: url.toString(),
  };
}
