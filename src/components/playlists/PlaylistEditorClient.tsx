'use client';
import { useState } from 'react';
import React from 'react';
import Link from 'next/link';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { runAction } from '@/server/actions/_action-result';

// ---------------------------------------------------------------------------
// Types (no server imports — plain data shapes only)
// ---------------------------------------------------------------------------

export interface PlaylistItemData {
  id: string;
  song_id: string;
  position: number;
  transpose_semitones: number;
  capo: number | null;
  performance_notes: string | null;
  song: {
    id: string;
    title: string;
    language: string;
    original_key: string;
    bpm?: number | null;
  } | null;
}

export interface SongPickerItem {
  id: string;
  title: string;
  language: string;
  original_key: string;
  bpm?: number | null;
}

export interface PlaylistEditorClientProps {
  playlistId: string;
  initialName: string;
  initialDate: string;
  initialDesc: string;
  initialItems: PlaylistItemData[];
  allSongs: SongPickerItem[];
  // Server actions passed as props (inline 'use server' from the page)
  onSaveMeta: (name: string, scheduledFor: string, description: string) => Promise<void>;
  onAddSong: (songId: string) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onUpdateItemTranspose: (itemId: string, semitones: number) => Promise<void>;
  onUpdateItemCapo: (itemId: string, capo: number | null) => Promise<void>;
  onUpdateItemNotes: (itemId: string, notes: string | null) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onSaveVersion: () => Promise<void>;
}

const LANG_FLAG: Record<string, string> = { de: '🇩🇪', en: '🇬🇧', ta: '🇮🇳' };
const SEMITONE_OPTIONS = Array.from({ length: 25 }, (_, i) => i - 12);

export function PlaylistEditorClient({
  playlistId,
  initialName,
  initialDate,
  initialDesc,
  initialItems,
  allSongs,
  onSaveMeta,
  onAddSong,
  onRemoveItem,
  onUpdateItemTranspose,
  onUpdateItemCapo,
  onUpdateItemNotes,
  onReorder,
  onSaveVersion,
}: PlaylistEditorClientProps) {
  const [items, setItems] = useState<PlaylistItemData[]>(initialItems);
  const [name, setName] = useState(initialName);
  const [date, setDate] = useState(initialDate);
  const [desc, setDesc] = useState(initialDesc);
  const [songSearch, setSongSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const tmpIdCounter = React.useRef(0);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await runAction(() => onSaveMeta(name, date, desc));
    setSaving(false);
    showToast('Playlist saved.');
  }

  async function handleAddSong(songId: string) {
    const song = allSongs.find((s) => s.id === songId);
    if (!song) return;
    const result = await runAction(() => onAddSong(songId));
    if (result.ok) {
      const newItem: PlaylistItemData = {
        id: `tmp-${++tmpIdCounter.current}`,
        song_id: songId,
        position: items.length,
        transpose_semitones: 0,
        capo: null,
        performance_notes: null,
        song: { id: song.id, title: song.title, language: song.language, original_key: song.original_key, bpm: song.bpm ?? null },
      };
      setItems((prev) => [...prev, newItem]);
      showToast('Song added.');
    } else {
      showToast(`Error: ${result.error.message}`);
    }
  }

  async function handleRemoveItem(itemId: string) {
    const result = await runAction(() => onRemoveItem(itemId));
    if (result.ok) {
      setItems((prev) => prev.filter((it) => it.id !== itemId).map((it, i) => ({ ...it, position: i })));
      showToast('Song removed.');
    } else {
      showToast(`Error: ${result.error.message}`);
    }
  }

  async function handleMoveUp(idx: number) {
    if (idx === 0) return;
    const next = [...items];
    const a = next[idx - 1];
    const b = next[idx];
    if (!a || !b) return;
    next[idx - 1] = { ...b, position: idx - 1 };
    next[idx] = { ...a, position: idx };
    setItems(next);
    await runAction(() => onReorder(next.map((it) => it.id)));
  }

  async function handleMoveDown(idx: number) {
    if (idx >= items.length - 1) return;
    const next = [...items];
    const a = next[idx];
    const b = next[idx + 1];
    if (!a || !b) return;
    next[idx] = { ...b, position: idx };
    next[idx + 1] = { ...a, position: idx + 1 };
    setItems(next);
    await runAction(() => onReorder(next.map((it) => it.id)));
  }

  async function handleTransposeChange(item: PlaylistItemData, val: number) {
    setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, transpose_semitones: val } : it));
    await runAction(() => onUpdateItemTranspose(item.id, val));
  }

  async function handleCapoChange(item: PlaylistItemData, val: number | null) {
    setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, capo: val } : it));
    await runAction(() => onUpdateItemCapo(item.id, val));
  }

  async function handleNotesBlur(item: PlaylistItemData, val: string) {
    const notes = val.trim() || null;
    setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, performance_notes: notes } : it));
    await runAction(() => onUpdateItemNotes(item.id, notes));
  }

  async function handleSaveVersion() {
    setSaving(true);
    const result = await runAction(() => onSaveVersion());
    setSaving(false);
    if (result.ok) showToast('Version saved.');
    else showToast(`Error: ${result.error.message}`);
  }

  const filteredSongs = allSongs.filter((s) =>
    s.title.toLowerCase().includes(songSearch.toLowerCase()),
  );

  return (
    <div className="grid gap-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-(--color-accent) px-4 py-2 text-sm text-(--color-accent-fg) shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold truncate">Edit: {name}</h1>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSaveVersion}
            disabled={saving}
            className="rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium hover:bg-(--color-muted) disabled:opacity-50"
          >
            Save version
          </button>
          <Link
            href={`/playlists/${playlistId}`}
            className="rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium hover:bg-(--color-muted)"
          >
            View
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* LEFT: Metadata + items */}
        <div className="grid gap-6">
          {/* Metadata form */}
          <form
            onSubmit={handleSaveMeta}
            className="grid gap-4 rounded-xl border border-(--color-border) p-4"
          >
            <h2 className="text-sm font-semibold text-(--color-muted-fg) uppercase tracking-wide">
              Playlist info
            </h2>
            <div className="grid gap-1.5">
              <label htmlFor="edit-name" className="text-sm font-medium">Name</label>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
                className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="edit-date" className="text-sm font-medium">Date (optional)</label>
              <input
                id="edit-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="edit-desc" className="text-sm font-medium">Description (optional)</label>
              <textarea
                id="edit-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={2000}
                rows={2}
                className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent) resize-y"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90 disabled:opacity-50 w-fit"
            >
              Save changes
            </button>
          </form>

          {/* Items */}
          <div className="grid gap-3">
            <h2 className="text-sm font-semibold text-(--color-muted-fg) uppercase tracking-wide">
              Songs ({items.length})
            </h2>
            {items.length === 0 ? (
              <p className="text-(--color-muted-fg) text-sm">
                No songs yet. Add from the right column.
              </p>
            ) : (
              <ol className="grid gap-2">
                {items.map((item, idx) => {
                  const song = item.song;
                  if (!song) return null;
                  const flag = LANG_FLAG[song.language] ?? '';
                  return (
                    <li key={item.id} className="rounded-xl border border-(--color-border) p-3 grid gap-3">
                      {/* Title + reorder */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-(--color-muted-fg) w-5 shrink-0">{idx + 1}</span>
                        <p className="font-medium flex-1 truncate">
                          {flag && <span className="mr-1">{flag}</span>}
                          {song.title}
                        </p>
                        <button
                          type="button"
                          aria-label="Move up"
                          disabled={idx === 0}
                          onClick={() => handleMoveUp(idx)}
                          className="size-7 flex items-center justify-center rounded border border-(--color-border) hover:bg-(--color-muted) disabled:opacity-30"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={idx === items.length - 1}
                          onClick={() => handleMoveDown(idx)}
                          className="size-7 flex items-center justify-center rounded border border-(--color-border) hover:bg-(--color-muted) disabled:opacity-30"
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Remove song"
                          onClick={() => handleRemoveItem(item.id)}
                          className="size-7 flex items-center justify-center rounded border border-red-200 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      {/* Controls */}
                      <div className="flex flex-wrap items-center gap-3 pl-7 text-sm">
                        <label className="flex items-center gap-1.5">
                          <span className="text-xs text-(--color-muted-fg)">Transpose</span>
                          <select
                            value={item.transpose_semitones}
                            onChange={(e) => handleTransposeChange(item, Number(e.target.value))}
                            className="rounded border border-(--color-border) bg-(--color-bg) px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                          >
                            {SEMITONE_OPTIONS.map((n) => (
                              <option key={n} value={n}>
                                {n === 0 ? 'Original' : n > 0 ? `+${n}` : n}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <span className="text-xs text-(--color-muted-fg)">Capo</span>
                          <select
                            value={item.capo ?? 0}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              handleCapoChange(item, v === 0 ? null : v);
                            }}
                            className="rounded border border-(--color-border) bg-(--color-bg) px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                          >
                            {Array.from({ length: 12 }, (_, i) => (
                              <option key={i} value={i}>
                                {i === 0 ? 'No capo' : `Capo ${i}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {/* Notes */}
                      <div className="pl-7">
                        <input
                          type="text"
                          defaultValue={item.performance_notes ?? ''}
                          onBlur={(e) => handleNotesBlur(item, e.target.value)}
                          maxLength={2000}
                          placeholder="Performance notes…"
                          className="w-full rounded border border-(--color-border) bg-(--color-bg) px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {/* RIGHT: Song picker */}
        <div className="rounded-xl border border-(--color-border) p-4 grid gap-3 lg:sticky lg:top-4">
          <h2 className="text-sm font-semibold text-(--color-muted-fg) uppercase tracking-wide">
            Add song
          </h2>
          <input
            type="search"
            value={songSearch}
            onChange={(e) => setSongSearch(e.target.value)}
            placeholder="Search songs…"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
          <ul className="grid gap-1 max-h-[60vh] overflow-y-auto">
            {filteredSongs.length === 0 ? (
              <li className="text-xs text-(--color-muted-fg) px-1">No songs found.</li>
            ) : (
              filteredSongs.map((song) => {
                const flag = LANG_FLAG[song.language] ?? '';
                const alreadyAdded = items.some((it) => it.song_id === song.id);
                return (
                  <li key={song.id}>
                    <button
                      type="button"
                      onClick={() => handleAddSong(song.id)}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-(--color-muted) transition-colors"
                    >
                      <Plus className="size-3.5 shrink-0 text-(--color-muted-fg)" />
                      <span className="flex-1 truncate">
                        {flag && <span className="mr-1">{flag}</span>}
                        {song.title}
                      </span>
                      <span className="text-xs font-mono text-(--color-muted-fg) shrink-0">
                        {song.original_key}
                      </span>
                      {alreadyAdded && (
                        <span className="text-xs text-(--color-muted-fg) shrink-0">✓</span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
