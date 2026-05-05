import { describe, it, expect } from 'vitest';
import { parseChord, tokenizeChordPro } from '../parse';

describe('parseChord', () => {
  it.each([
    ['C',     { rootText: 'C',  quality: '', bassText: undefined }],
    ['Cm',    { rootText: 'C',  quality: 'm', bassText: undefined }],
    ['Cmaj7', { rootText: 'C',  quality: 'maj7', bassText: undefined }],
    ['C#m7',  { rootText: 'C#', quality: 'm7', bassText: undefined }],
    ['Bb',    { rootText: 'Bb', quality: '', bassText: undefined }],
    ['F#',    { rootText: 'F#', quality: '', bassText: undefined }],
    ['G/B',   { rootText: 'G',  quality: '', bassText: 'B' }],
    ['G/Bb',  { rootText: 'G',  quality: '', bassText: 'Bb' }],
    ['Cmaj7#11', { rootText: 'C', quality: 'maj7#11', bassText: undefined }],
    ['Cdim7', { rootText: 'C',  quality: 'dim7', bassText: undefined }],
    ['Caug',  { rootText: 'C',  quality: 'aug', bassText: undefined }],
    ['Csus4', { rootText: 'C',  quality: 'sus4', bassText: undefined }],
    ['Cadd9', { rootText: 'C',  quality: 'add9', bassText: undefined }],
  ])('%s', (input, expected) => {
    const r = parseChord(input);
    expect(r).not.toBeNull();
    expect(r!.rootText).toBe(expected.rootText);
    expect(r!.quality).toBe(expected.quality);
    expect(r!.bassText).toBe(expected.bassText);
    expect(r!.raw).toBe(input);
  });

  it.each(['N.C.', '*', 'Chorus', 'Hb', '', '/', 'C/', '/C'])('returns null for %s', (input) => {
    expect(parseChord(input)).toBeNull();
  });
});

describe('tokenizeChordPro', () => {
  it('splits text/chord/directive/newline tokens', () => {
    const tokens = tokenizeChordPro('{title: A}\n[G]Hi[C]there\n');
    const types = tokens.map((t) => t.type);
    expect(types).toContain('directive');
    expect(types).toContain('chord');
    expect(types).toContain('text');
    expect(types).toContain('newline');
  });
  it('preserves chord raw text', () => {
    const tokens = tokenizeChordPro('[G/B]hi');
    const chord = tokens.find((t) => t.type === 'chord');
    expect(chord?.value).toBe('G/B');
  });
  it('ignores brackets that are not closed', () => {
    const tokens = tokenizeChordPro('[unclosed');
    expect(tokens.find((t) => t.type === 'chord')).toBeUndefined();
  });
  it('handles empty body', () => {
    expect(tokenizeChordPro('')).toEqual([]);
  });
  it('preserves Unicode text including Tamil', () => {
    const tokens = tokenizeChordPro('[G]அற்புத[C]மான');
    const text = tokens.filter((t) => t.type === 'text').map((t) => t.value).join('');
    expect(text).toBe('அற்புதமான');
  });
});
