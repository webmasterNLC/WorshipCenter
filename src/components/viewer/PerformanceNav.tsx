'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Radio, RadioOff } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { usePlaylistRealtime } from '@/lib/hooks/usePlaylistRealtime';

interface PerformanceNavProps {
  playlistId: string;
  currentIdx: number;
  totalItems: number;
  programLabel: string;
}

const FOLLOW_KEY = 'songdrop-follow-lead';

export function PerformanceNav({
  playlistId,
  currentIdx,
  totalItems,
  programLabel,
}: PerformanceNavProps) {
  const router = useRouter();
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < totalItems - 1;
  const prevUrl = hasPrev ? `/playlists/${playlistId}/play/${currentIdx - 1}` : null;
  const nextUrl = hasNext ? `/playlists/${playlistId}/play/${currentIdx + 1}` : null;

  // Follow-Lead toggle — when ON, realtime playlist_items changes refresh
  // this iPad. When OFF, the musician can break out (different key, etc.)
  // without being yanked back by the lead's edits. Persisted per device.
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (localStorage.getItem(FOLLOW_KEY) === 'false') setFollow(false);
  }, []);
  useEffect(() => {
    localStorage.setItem(FOLLOW_KEY, String(follow));
  }, [follow]);

  // Ref so the realtime callback stays stable across follow toggles —
  // avoids tearing down and re-subscribing the channel on every flip.
  const followRef = useRef(follow);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const handleRemoteChange = useCallback(() => {
    if (followRef.current) router.refresh();
  }, [router]);
  usePlaylistRealtime(supabase, playlistId, handleRemoteChange);

  const handleToggleFollow = () => {
    const next = !follow;
    setFollow(next);
    // Re-enabling = snap back to the lead's latest state.
    if (next) router.refresh();
  };

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
        ← {programLabel}
      </Link>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleFollow}
          aria-pressed={follow}
          aria-label={follow ? 'Following lead — tap to break out' : 'Not following lead — tap to sync'}
          title={follow ? 'Following lead' : 'Solo'}
          className={`size-8 flex items-center justify-center rounded-full border transition-colors ${
            follow
              ? 'border-(--color-accent) text-(--color-accent)'
              : 'border-(--color-border) text-(--color-muted-fg)'
          }`}
        >
          {follow ? <Radio className="size-4" /> : <RadioOff className="size-4" />}
        </button>
        <span className="text-xs text-(--color-muted-fg) font-mono">
          {currentIdx + 1} / {totalItems}
        </span>
      </div>

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
