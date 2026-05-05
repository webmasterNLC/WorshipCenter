import { type Accidental, normalizeSemitones, rootFromPitchClass, detectKeyAccidental } from './pitch';
import { parseChord, tokenizeChordPro } from './parse';

export function transposeChord(token: string, semitones: number, prefer?: Accidental): string {
  const parsed = parseChord(token);
  if (!parsed) return token;
  // When no preference given, infer from the chord's own accidental to preserve enharmonic spelling.
  const pref = prefer ?? (parsed.rootText.endsWith('b') ? 'flat' : 'sharp');
  const newRootPc = normalizeSemitones(parsed.root + semitones);
  const newRoot = rootFromPitchClass(newRootPc, pref);
  let out = newRoot + parsed.quality;
  if (parsed.bass !== undefined) {
    const newBassPc = normalizeSemitones(parsed.bass + semitones);
    out += '/' + rootFromPitchClass(newBassPc, pref);
  }
  return out;
}

export function transposeKey(originalKey: string, semitones: number, prefer?: Accidental): string {
  const isMinor = originalKey.endsWith('m');
  const rootText = isMinor ? originalKey.slice(0, -1) : originalKey;
  const transposed = transposeChord(rootText, semitones, prefer ?? detectKeyAccidental(originalKey));
  return isMinor ? transposed + 'm' : transposed;
}

export function transposeChordPro(body: string, semitones: number, prefer?: Accidental): string {
  if (!body) return body;
  const tokens = tokenizeChordPro(body);
  const out: string[] = [];
  for (const t of tokens) {
    if (t.type === 'chord') {
      out.push('[' + transposeChord(t.value, semitones, prefer) + ']');
    } else if (t.type === 'directive') {
      out.push('{' + t.value + '}');
    } else if (t.type === 'newline') {
      out.push('\n');
    } else {
      out.push(t.value);
    }
  }
  return out.join('');
}
