'use client';
import { useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Subscribe to live changes on `playlist_items` for a single playlist via
 * Supabase Realtime (Postgres Changes over WebSocket). Fires `onChange` on
 * any INSERT / UPDATE / DELETE.
 *
 * RLS applies: the subscribing user needs SELECT on `playlist_items`. The
 * subscription is torn down on unmount.
 */
export function usePlaylistRealtime(
  supabase: SupabaseClient,
  playlistId: string,
  onChange: () => void,
): void {
  useEffect(() => {
    const channel = supabase
      .channel(`playlist:${playlistId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'playlist_items',
          filter: `playlist_id=eq.${playlistId}`,
        },
        () => onChange(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, playlistId, onChange]);
}
