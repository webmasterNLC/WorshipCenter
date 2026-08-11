export type PitchClass = number;
export type Accidental = 'sharp' | 'flat';

const NATURAL_TO_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function pitchClassFromRoot(root: string): PitchClass | null {
  if (!root) return null;
  const letter = root[0];
  if (!letter || !(letter in NATURAL_TO_PC)) return null;
  let pc = NATURAL_TO_PC[letter]!;
  const acc = root[1];
  if (acc === '#') pc = (pc + 1) % 12;
  else if (acc === 'b') pc = (pc + 11) % 12;
  return pc;
}

export function rootFromPitchClass(pc: PitchClass, prefer: Accidental): string {
  const names = prefer === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return names[((pc % 12) + 12) % 12]!;
}

const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb','Cb','Dm','Gm','Cm','Fm','Bbm','Ebm']);
const SHARP_KEYS = new Set(['G','D','A','E','B','F#','C#','Em','Bm','F#m','C#m','G#m','D#m','A#m']);

export function detectKeyAccidental(key: string): Accidental {
  if (FLAT_KEYS.has(key)) return 'flat';
  if (SHARP_KEYS.has(key)) return 'sharp';
  return 'sharp';
}

export function normalizeSemitones(n: number): PitchClass {
  return ((n % 12) + 12) % 12;
}

/**
 * Signed distance from one key to another, by the shorter way round.
 *
 * G→C is +5 (up a fourth) rather than -7 (down a fifth): same pitch class,
 * but the small number is the one a musician would say out loud, and it keeps
 * the result inside the ±12 range the transpose controls accept.
 *
 * Minor keys are compared by their root, so Am→Cm is the same +3 as A→C.
 * Returns null when either key is unparseable rather than guessing zero —
 * a silent 0 would look like "already in the right key".
 */
export function semitonesBetweenKeys(from: string, to: string): number | null {
  const rootOf = (k: string) => (k.endsWith('m') ? k.slice(0, -1) : k);
  const a = pitchClassFromRoot(rootOf(from));
  const b = pitchClassFromRoot(rootOf(to));
  if (a === null || b === null) return null;
  const up = normalizeSemitones(b - a);
  return up > 6 ? up - 12 : up;
}
