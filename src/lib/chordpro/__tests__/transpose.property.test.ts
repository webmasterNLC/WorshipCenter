import { describe, it } from 'vitest';
import fc from 'fast-check';
import { transposeChord } from '../transpose';
import { parseChord } from '../parse';

const chordRoots = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'];
const qualities  = ['','m','m7','maj7','sus4','sus2','dim','dim7','aug','7','9','add9'];

const chordArb = fc.tuple(fc.constantFrom(...chordRoots), fc.constantFrom(...qualities))
  .map(([r, q]) => r + q);
const chordWithBassArb = fc.tuple(chordArb, fc.constantFrom(...chordRoots))
  .map(([c, b]) => c + '/' + b);

describe('transposeChord properties', () => {
  it('round-trip: transpose(transpose(x, n), -n) preserves pitch class', () => {
    fc.assert(
      fc.property(chordArb, fc.integer({ min: -24, max: 24 }), (chord, n) => {
        if (!parseChord(chord)) return true;
        const there = transposeChord(chord, n);
        const back  = transposeChord(there, -n);
        const a = parseChord(chord)!;
        const b = parseChord(back);
        return !!b && a.root === b.root && a.quality === b.quality;
      }),
    );
  });

  it('idempotent at 0', () => {
    fc.assert(fc.property(chordArb, (c) => transposeChord(c, 0) === c));
  });

  it('octave invariance at +/-12 (up to enharmonic spelling)', () => {
    fc.assert(fc.property(chordArb, (c) => {
      const a = parseChord(c);
      if (!a) return true;
      const t = transposeChord(c, 12);
      const p = parseChord(t);
      return !!p && p.root === a.root && p.quality === a.quality;
    }));
  });

  it('bass parallelism: bass transposes the same as root', () => {
    fc.assert(fc.property(chordWithBassArb, fc.integer({ min: -12, max: 12 }), (c, n) => {
      const a = parseChord(c);
      if (!a || a.bass === undefined) return true;
      const t = transposeChord(c, n);
      const p = parseChord(t);
      if (!p || p.bass === undefined) return false;
      return ((p.bass - p.root + 12) % 12) === ((a.bass - a.root + 12) % 12);
    }));
  });
});
