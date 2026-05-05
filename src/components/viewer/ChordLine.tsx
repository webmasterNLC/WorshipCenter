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
      <div className="text-xs font-semibold uppercase tracking-wide text-(--color-muted-fg) mt-4 mb-1">
        {label}
      </div>
    );
  }

  const hasChords = block.segments.some((s) => s.chord !== null);

  return (
    <div
      className="flex flex-wrap gap-x-0 leading-none mb-1 lyric"
      lang={language}
    >
      {block.segments.map((seg, i) => (
        <span key={i} className="relative inline-block pr-2">
          {hasChords && (
            <span
              className="block text-xs font-bold text-(--color-accent) select-none"
              aria-hidden
              style={{ minHeight: '1.2em' }}
            >
              {seg.chord ?? ' '}
            </span>
          )}
          <span className="block text-base">{seg.lyric || ' '}</span>
        </span>
      ))}
    </div>
  );
}
