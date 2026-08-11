import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fetchUltimateGuitarSong, stripUgMarkup } from '../ultimateguitar';

// A real page captured from tabs.ultimate-guitar.com, trimmed to the fields the
// importer reads. Keeping the actual chart text means these tests fail if the
// conversion regresses, not just if the plumbing does.
const FIXTURE = readFileSync(
  join(__dirname, 'fixtures/ug-the-blessing.html'),
  'utf8',
);

function mockFetch(body: string, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(body, { status }) as never,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stripUgMarkup', () => {
  it('removes chord and block markers', () => {
    expect(stripUgMarkup('[tab][ch]C[/ch] hi[/tab]')).toBe('C hi');
  });

  it('leaves the column of each chord untouched', () => {
    // The padding around the markers is display padding, so a chord must land
    // on the same column once the markers are gone. This is the whole reason
    // the shared converter can be reused.
    const chords = '[ch]C[/ch]      [ch]F/C[/ch]';
    expect(stripUgMarkup(chords)).toBe('C      F/C');
    expect(stripUgMarkup(chords).indexOf('F/C')).toBe(7);
  });

  it('normalises CRLF so line pairing works', () => {
    expect(stripUgMarkup('a\r\nb')).toBe('a\nb');
  });

  it('unwraps section headers that would otherwise become chords', () => {
    // "[Intro]" left as-is is a ChordPro chord named Intro, which the
    // transposer would then try to parse as a root note.
    expect(stripUgMarkup('[Intro]\n[ch]C[/ch]')).toBe('Intro\nC');
    expect(stripUgMarkup('[Verse 1]')).toBe('Verse 1');
  });

  it('leaves a bracketed line alone when it is part of a lyric line', () => {
    expect(stripUgMarkup('sing [Intro] loud')).toBe('sing [Intro] loud');
  });
});

describe('fetchUltimateGuitarSong', () => {
  const URL_OK = 'https://tabs.ultimate-guitar.com/tab/elevation-worship/the-blessing-chords-3014201';

  it('rejects hosts it does not understand', async () => {
    await expect(fetchUltimateGuitarSong('https://example.com/x')).rejects.toThrow(
      /ultimate-guitar\.com/,
    );
  });

  it('rejects a malformed URL', async () => {
    await expect(fetchUltimateGuitarSong('not a url')).rejects.toThrow(/valid URL/);
  });

  it('reads title, artist and the declared key', async () => {
    mockFetch(FIXTURE);
    const song = await fetchUltimateGuitarSong(URL_OK);
    expect(song.title).toBe('The Blessing');
    expect(song.artist).toBe('Elevation Worship');
    // Declared by the site, not guessed from the first chord.
    expect(song.original_key).toBe('C');
    expect(song.capo).toBeNull();
    expect(song.source_url).toBe(URL_OK);
  });

  it('converts the chart to ChordPro', async () => {
    mockFetch(FIXTURE);
    const { body_chordpro } = await fetchUltimateGuitarSong(URL_OK);
    expect(body_chordpro).toContain('{comment: Intro}');
    expect(body_chordpro).toContain('{comment: Verse 1}');
    // Chords inline, markers gone.
    expect(body_chordpro).toContain('[C]');
    expect(body_chordpro).not.toContain('[ch]');
    expect(body_chordpro).not.toContain('[tab]');
    expect(body_chordpro).toMatch(/The Lord bless you/);
  });

  it('turns a 404 into a message that says what to do', async () => {
    mockFetch('', 404);
    await expect(fetchUltimateGuitarSong(URL_OK)).rejects.toThrow(/does not exist/);
  });

  it('refuses non-chord tabs instead of importing fret noise', async () => {
    mockFetch(FIXTURE.replace('Chords', 'Bass Tabs'));
    await expect(fetchUltimateGuitarSong(URL_OK)).rejects.toThrow(/Bass Tabs/);
  });

  it('explains itself when the page format changes', async () => {
    mockFetch('<html><body>nothing here</body></html>');
    await expect(fetchUltimateGuitarSong(URL_OK)).rejects.toThrow(/page format/);
  });

  it('falls back to reading the chart when the key field is junk', async () => {
    mockFetch(FIXTURE.replace('&quot;tonality_name&quot;: &quot;C&quot;', '&quot;tonality_name&quot;: &quot;Hmmm&quot;'));
    const song = await fetchUltimateGuitarSong(URL_OK);
    expect(song.original_key).toMatch(/^[A-G](#|b)?m?$/);
  });
});
