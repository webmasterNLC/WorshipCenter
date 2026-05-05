import { tokenizeChordPro } from './parse';

export type RenderSegment = { chord: string | null; lyric: string };
export type RenderBlock =
  | { type: 'line'; segments: RenderSegment[] }
  | { type: 'directive'; value: string };

export function renderToBlocks(body: string): RenderBlock[] {
  const tokens = tokenizeChordPro(body);
  const out: RenderBlock[] = [];
  let currentSegments: RenderSegment[] = [];
  let pending: RenderSegment | null = null;

  const flushPending = () => {
    if (pending) {
      currentSegments.push(pending);
      pending = null;
    }
  };
  const flushLine = () => {
    flushPending();
    if (currentSegments.length > 0) {
      out.push({ type: 'line', segments: currentSegments });
      currentSegments = [];
    }
  };

  for (const t of tokens) {
    if (t.type === 'directive') {
      flushLine();
      out.push({ type: 'directive', value: t.value });
      continue;
    }
    if (t.type === 'newline') {
      flushLine();
      continue;
    }
    if (t.type === 'chord') {
      flushPending();
      pending = { chord: t.value, lyric: '' };
      continue;
    }
    if (pending) {
      pending.lyric += t.value;
    } else {
      pending = { chord: null, lyric: t.value };
    }
  }
  flushLine();
  return out;
}
