import { describe, it, expect } from 'vitest';
import { renderToBlocks } from '../render';

describe('renderToBlocks', () => {
  it('groups by line, splits each line into chord+lyric segments', () => {
    const blocks = renderToBlocks('[G]Amazing [C]grace\n[D]how sweet');
    expect(blocks).toEqual([
      { type: 'line', segments: [
        { chord: 'G', lyric: 'Amazing ' },
        { chord: 'C', lyric: 'grace' },
      ]},
      { type: 'line', segments: [
        { chord: 'D', lyric: 'how sweet' },
      ]},
    ]);
  });
  it('handles lyric-only lines', () => {
    const blocks = renderToBlocks('plain lyric line\n');
    expect(blocks).toEqual([
      { type: 'line', segments: [{ chord: null, lyric: 'plain lyric line' }] },
    ]);
  });
  it('emits directives as their own blocks', () => {
    const blocks = renderToBlocks('{title: A}\n{start_of_chorus}\n[G]Hi');
    const directives = blocks.filter((b) => b.type === 'directive');
    expect(directives).toHaveLength(2);
  });
  it('preserves Tamil text inside lyric segments', () => {
    const blocks = renderToBlocks('[G]அற்புத[C]மான');
    expect(blocks).toEqual([
      { type: 'line', segments: [
        { chord: 'G', lyric: 'அற்புத' },
        { chord: 'C', lyric: 'மான' },
      ]},
    ]);
  });
});
