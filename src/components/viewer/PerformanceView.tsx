'use client';
import { useCallback, useEffect, useState } from 'react';
import { SongViewer } from './SongViewer';
import { PerformanceNav } from './PerformanceNav';

interface Translation {
  language: string;
  title: string;
  body_chordpro: string;
  is_primary: boolean;
}

interface Song {
  id: string;
  title: string;
  language: string;
  original_key: string;
  bpm?: number | null;
  time_signature?: string | null;
  body_chordpro: string;
  notes?: string | null;
  tags?: string[];
  translations?: Translation[];
}

interface PerformanceViewProps {
  song: Song;
  itemId: string;
  initialSemitones: number;
  playlistId: string;
  currentIdx: number;
  totalItems: number;
  programLabel: string;
  /** True if the viewer is a leader/admin assigned to this playlist. */
  canEdit: boolean;
  /** Inline server-action wrapper from the page. Only invoked when broadcast
   *  is on; ignored otherwise. */
  onBroadcastTranspose: (itemId: string, semitones: number) => Promise<void>;
  editHref?: string;
}

const BROADCAST_KEY = 'songdrop-broadcast-mode';

export function PerformanceView({
  song,
  itemId,
  initialSemitones,
  playlistId,
  currentIdx,
  totalItems,
  programLabel,
  canEdit,
  onBroadcastTranspose,
  editHref,
}: PerformanceViewProps) {
  // Broadcast mode — when ON and the user has write access, +/- on this iPad
  // writes the new transpose back to playlist_items so the realtime channel
  // pushes it to every other connected iPad. Default OFF so the lead can
  // preview a key change before committing.
  const [broadcasting, setBroadcasting] = useState(false);
  useEffect(() => {
    if (canEdit && localStorage.getItem(BROADCAST_KEY) === 'true') {
      setBroadcasting(true);
    }
  }, [canEdit]);
  useEffect(() => {
    localStorage.setItem(BROADCAST_KEY, String(broadcasting));
  }, [broadcasting]);

  const handleTransposeChange = useCallback(
    (next: number) => {
      if (!broadcasting || !canEdit) return;
      void onBroadcastTranspose(itemId, next).catch((err) => {
        console.error('[broadcast] updatePlaylistItem failed:', err);
      });
    },
    [broadcasting, canEdit, itemId, onBroadcastTranspose],
  );

  return (
    <SongViewer
      song={song}
      dial
      initialSemitones={initialSemitones}
      onSemitonesChange={handleTransposeChange}
      navigationSlot={
        <PerformanceNav
          playlistId={playlistId}
          currentIdx={currentIdx}
          totalItems={totalItems}
          programLabel={programLabel}
          canBroadcast={canEdit}
          broadcasting={broadcasting}
          onBroadcastChange={setBroadcasting}
        />
      }
      {...(editHref !== undefined ? { editHref } : {})}
    />
  );
}
