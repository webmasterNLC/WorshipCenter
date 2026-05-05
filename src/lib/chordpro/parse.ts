import { pitchClassFromRoot, type PitchClass } from './pitch';

export interface ParsedChord {
  root: PitchClass;
  rootText: string;
  quality: string;
  bass?: PitchClass;
  bassText?: string;
  raw: string;
}

export type ChordProToken =
  | { type: 'text'; value: string }
  | { type: 'chord'; value: string }
  | { type: 'directive'; value: string }
  | { type: 'newline' };

// Quality chars: only chars that appear in real chord quality tokens.
// This intentionally excludes letters like h, r, o that appear in words like "Chorus".
const CHORD_RE = /^([A-G])(#|b)?([majdisugnt+°Δ0-9#]*)(?:\/([A-G])(#|b)?)?$/;

export function parseChord(token: string): ParsedChord | null {
  const m = CHORD_RE.exec(token);
  if (!m) return null;
  const [, rootLetter, rootAcc = '', quality = '', bassLetter, bassAcc = ''] = m;
  const rootText = `${rootLetter}${rootAcc}`;
  const root = pitchClassFromRoot(rootText);
  if (root === null) return null;
  let bass: PitchClass | undefined;
  let bassText: string | undefined;
  if (bassLetter) {
    bassText = `${bassLetter}${bassAcc}`;
    const b = pitchClassFromRoot(bassText);
    if (b === null) return null;
    bass = b;
  }
  return { root, rootText, quality, bass, bassText, raw: token };
}

export function tokenizeChordPro(body: string): ChordProToken[] {
  const tokens: ChordProToken[] = [];
  let i = 0;
  let textBuf = '';
  const flushText = () => {
    if (textBuf) {
      tokens.push({ type: 'text', value: textBuf });
      textBuf = '';
    }
  };
  while (i < body.length) {
    const ch = body[i]!;
    if (ch === '\n') {
      flushText();
      tokens.push({ type: 'newline' });
      i += 1;
      continue;
    }
    if (ch === '[') {
      const close = body.indexOf(']', i + 1);
      if (close === -1) {
        textBuf += body.slice(i);
        i = body.length;
        continue;
      }
      flushText();
      tokens.push({ type: 'chord', value: body.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    if (ch === '{') {
      const close = body.indexOf('}', i + 1);
      if (close === -1) {
        textBuf += body.slice(i);
        i = body.length;
        continue;
      }
      flushText();
      tokens.push({ type: 'directive', value: body.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    textBuf += ch;
    i += 1;
  }
  flushText();
  return tokens;
}
