import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The viewer scales the whole chart from one font-size set on the article, and
 * the width cap is an em multiple of it. Both only work while the chart's own
 * markup stays relative.
 *
 * A single absolute Tailwind size anywhere in this subtree — `text-base` was
 * the one that shipped — pins that text and silently overrides the inherited
 * size. Nothing errors, nothing looks broken in review; the A−/A+ buttons just
 * stop having a visible effect. That is hard to spot and was reported as
 * "the buttons don't work", so it gets a check rather than a comment alone.
 */

const ABSOLUTE_TEXT = /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/g;

/**
 * Source with comments removed — the comments in these files deliberately name
 * the classes to avoid, and matching those would make the check unfixable.
 */
function read(file: string): string {
  return readFileSync(join('src/components/viewer', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('chart text scales with the viewer font size', () => {
  it('ChordLine uses no absolute text sizes', () => {
    const found = read('ChordLine.tsx').match(ABSOLUTE_TEXT) ?? [];
    expect(found).toEqual([]);
  });

  it('SongViewer caps width in em, not a fixed rem class', () => {
    const src = read('SongViewer.tsx');
    // max-w-3xl is 48rem off the root size — it cannot track the chosen font.
    expect(src).not.toMatch(/className="[^"]*\bmax-w-\d/);
    expect(src).toContain("maxWidth: '48em'");
  });

  it('keeps one transpose control, the Key Dial', () => {
    const src = read('SongViewer.tsx');
    expect(src).toContain('<KeyDial');
    // The song page used to carry a second, different control for the same job.
    expect(src).not.toMatch(/Transpose (up|down)/);
  });
});
