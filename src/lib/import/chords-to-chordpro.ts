import 'server-only';

// Shared chord-chart conversion. Both importers receive the same shape of
// input — chord lines sitting above lyric lines on a monospace grid — and
// differ only in how they get it out of a page. Ultimate Guitar marks its
// chords with [ch]...[/ch]; stripping those markers leaves exactly the grid
// this module expects, because the padding around them is display padding.

const CHORD_TOKEN =
  /^[A-G](#|b)?(m|maj|sus|dim|aug|add)?\d*(\/[A-G](#|b)?)?$/;

// Header words we treat as section titles when they appear alone on a line.
const SECTION_LABEL =
  /^(intro|verse\s*\d*|pre[-\s]?chorus|chorus\s*\d*|bridge\s*\d*|outro|tag|interlude|refrain|coda|ending|instrumental|turnaround|solo|vamp|breakdown)\b/i;

/** Decode the small HTML entity subset these sites emit. */
export function decodeEntities(s: string): string {
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

export function isChordLine(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  return trimmed.split(/\s+/).every((t) => CHORD_TOKEN.test(t));
}

/**
 * Take a chord line and the lyric line beneath it and weave the chords
 * inline. Chord positions that land mid-word are snapped back to the
 * start of the word — pnwchords often places the chord 1-2 columns
 * "into" the word, which is visually correct on their grid but reads
 * wrong as ChordPro. Musical convention is chord-on-word-start.
 *
 *   "      A"                    →  "I'll [A]praise..."
 *   "I'll praise..."             (instead of "I'll p[A]raise...")
 */
function mergeChordOverLyric(chord: string, lyric: string): string {
  const paddedLyric = lyric.padEnd(chord.length, ' ');

  // 1. Extract every chord token + the column it starts at.
  const tokens: Array<{ token: string; col: number }> = [];
  let i = 0;
  while (i < chord.length) {
    if (chord[i] !== ' ') {
      let j = i;
      while (j < chord.length && chord[j] !== ' ') j++;
      tokens.push({ token: chord.slice(i, j), col: i });
      i = j;
    } else {
      i++;
    }
  }

  // 2. Snap each token's column to the start of the word it lands in.
  //    If the column lands on whitespace or punctuation, leave it.
  const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}']/u.test(c);
  const snapped = tokens.map(({ token, col }) => {
    let p = col;
    if (p < paddedLyric.length && isWordChar(paddedLyric[p])) {
      while (p > 0 && isWordChar(paddedLyric[p - 1])) p--;
    }
    return { token, col: p };
  });

  // 3. Walk the lyric, emit chords at their snapped columns. Multiple
  //    chords at the same column are concatenated in order.
  snapped.sort((a, b) => a.col - b.col);
  let out = '';
  let lyricPos = 0;
  let chordIdx = 0;
  while (lyricPos < paddedLyric.length) {
    while (chordIdx < snapped.length && snapped[chordIdx]!.col === lyricPos) {
      out += `[${snapped[chordIdx]!.token}]`;
      chordIdx++;
    }
    out += paddedLyric[lyricPos];
    lyricPos++;
  }
  // Any chord positioned beyond the lyric's last column is appended at the end.
  while (chordIdx < snapped.length) {
    out += `[${snapped[chordIdx]!.token}]`;
    chordIdx++;
  }
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

/** Best-effort: first chord token in the body is taken as the song's key. */
export function inferKey(body: string): string {
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
