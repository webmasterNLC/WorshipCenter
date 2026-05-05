'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PerformanceNavProps {
  playlistId: string;
  currentIdx: number;
  totalItems: number;
  playlistName: string;
}

export function PerformanceNav({
  playlistId,
  currentIdx,
  totalItems,
  playlistName,
}: PerformanceNavProps) {
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < totalItems - 1;
  const prevUrl = hasPrev ? `/playlists/${playlistId}/play/${currentIdx - 1}` : null;
  const nextUrl = hasNext ? `/playlists/${playlistId}/play/${currentIdx + 1}` : null;

  // Keyboard / Bluetooth pedal navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (nextUrl) window.location.href = nextUrl;
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (prevUrl) window.location.href = prevUrl;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [prevUrl, nextUrl]);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-(--color-border) bg-(--color-bg)/90 backdrop-blur">
      <Link
        href={`/playlists/${playlistId}`}
        className="text-sm text-(--color-muted-fg) hover:text-(--color-fg) truncate max-w-[160px]"
      >
        ← {playlistName}
      </Link>

      <span className="text-xs text-(--color-muted-fg) font-mono">
        {currentIdx + 1} / {totalItems}
      </span>

      <div className="flex gap-1">
        {prevUrl ? (
          <Link
            href={prevUrl}
            prefetch
            aria-label="Previous song"
            className="size-8 flex items-center justify-center rounded-full border border-(--color-border) hover:bg-(--color-muted)"
          >
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className="size-8" />
        )}
        {nextUrl ? (
          <Link
            href={nextUrl}
            prefetch
            aria-label="Next song"
            className="size-8 flex items-center justify-center rounded-full border border-(--color-border) hover:bg-(--color-muted)"
          >
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="size-8" />
        )}
      </div>
    </div>
  );
}
