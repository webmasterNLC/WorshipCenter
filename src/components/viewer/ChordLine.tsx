'use client';
import type { RenderBlock } from '@/lib/chordpro';

interface ChordLineProps {
  block: RenderBlock;
  language?: string;
}

export function ChordLine({ block, language }: ChordLineProps) {
  if (block.type === 'directive') {
    const value = block.value.trim();
    // Skip internal directive names from display
    if (value.startsWith('start_of_') || value.startsWith('end_of_')) {
      return null;
    }
    const colonIdx = value.indexOf(':');
    const label = colonIdx !== -1 ? value.slice(colonIdx + 1).trim() : value;
    return (
      <div className="text-[0.75em] font-semibold uppercase tracking-wide text-(--color-muted-fg) mt-[1em] mb-[0.25em]">
        {label}
      </div>
    );
  }

  const hasChords = block.segments.some((s) => s.chord !== null);

  // Every size and gap below is in em so the chart scales from the single
  // font-size the viewer sets. Tailwind's text-* and spacing utilities are
  // absolute rem values: `text-base` here pinned each lyric to 16px and
  // silently overrode the inherited size, which is why the A−/A+ buttons
  // looked dead. Do not reintroduce a fixed text-* class on this subtree.
  return (
    <div
      className="flex flex-wrap gap-x-0 leading-none mb-[0.25em] lyric"
      lang={language}
    >
      {block.segments.map((seg, i) => (
        <span key={i} className="relative inline-block">
          {hasChords && (
            <span
              className="block text-[0.75em] font-bold text-(--color-accent) select-none pr-[0.5em]"
              aria-hidden
              style={{ minHeight: '1.2em' }}
            >
              {seg.chord ?? ' '}
            </span>
          )}
          <span className="block whitespace-pre">{seg.lyric || ' '}</span>
        </span>
      ))}
    </div>
  );
}
