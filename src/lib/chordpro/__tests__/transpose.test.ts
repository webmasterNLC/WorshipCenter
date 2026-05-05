import { describe, it, expect } from 'vitest';
import { transposeChord, transposeKey, transposeChordPro } from '../transpose';

describe('transposeChord — 16 spec cases', () => {
  it('1. C +2 -> D', () => expect(transposeChord('C', 2)).toBe('D'));
  it('2. Bb +1 -> B', () => expect(transposeChord('Bb', 1)).toBe('B'));
  it('3. B +1 -> C (wrap)', () => expect(transposeChord('B', 1)).toBe('C'));
  it('4. F#m +0 -> F#m', () => expect(transposeChord('F#m', 0)).toBe('F#m'));
  it('5. G/B +5 -> C/E (bass transposes)', () => expect(transposeChord('G/B', 5)).toBe('C/E'));
  it('6. Cmaj7 +3 -> Ebmaj7 (flat default)', () => expect(transposeChord('Cmaj7', 3, 'flat')).toBe('Ebmaj7'));
  it('7. Csus4 -1 -> Bsus4', () => expect(transposeChord('Csus4', -1)).toBe('Bsus4'));
  it('8a. Caug verbatim', () => expect(transposeChord('Caug', 0)).toBe('Caug'));
  it('8b. Cdim7 verbatim', () => expect(transposeChord('Cdim7', 0)).toBe('Cdim7'));
  it('8c. C° verbatim quality', () => expect(transposeChord('C°', 2)).toBe('D°'));
  it('9. [N.C.] passthrough returns input unchanged', () => expect(transposeChord('N.C.', 5)).toBe('N.C.'));
  it('10a. negative wrap -1 from C -> B', () => expect(transposeChord('C', -1)).toBe('B'));
  it('10b. >12 wrap C +13 -> C#', () => expect(transposeChord('C', 13)).toBe('C#'));
  it('10c. <-12 wrap C -13 -> B', () => expect(transposeChord('C', -13)).toBe('B'));
  it('12. F-keyed flat lean: F +1 -> Gb (not F#)', () => expect(transposeChord('F', 1, 'flat')).toBe('Gb'));
});

describe('transposeKey', () => {
  it('G +2 -> A', () => expect(transposeKey('G', 2)).toBe('A'));
  it('F#m +1 -> Gm', () => expect(transposeKey('F#m', 1, 'flat')).toBe('Gm'));
  it('preserves minor flag', () => expect(transposeKey('Em', 5)).toBe('Am'));
});

describe('transposeChordPro', () => {
  it('14. positions preserved', () => {
    expect(transposeChordPro('[G]Amazing[C]grace', 2)).toBe('[A]Amazing[D]grace');
  });
  it('13. directives untouched', () => {
    const body = '{title: Amazing Grace}\n{key: G}\n[G]Amazing [C]grace\n';
    const out = transposeChordPro(body, 2);
    expect(out).toContain('{title: Amazing Grace}');
    expect(out).toContain('{key: G}');
    expect(out).toContain('[A]Amazing [D]grace');
  });
  it('15. empty body handled', () => {
    expect(transposeChordPro('', 5)).toBe('');
  });
  it('16. Tamil lyrics with Latin chords', () => {
    expect(transposeChordPro('[G]அற்புத[C]மான', 2)).toBe('[A]அற்புத[D]மான');
  });
  it('unparseable chord tokens pass through unchanged', () => {
    expect(transposeChordPro('[N.C.]hello[*]world[G]chord', 2)).toBe('[N.C.]hello[*]world[A]chord');
  });
});
