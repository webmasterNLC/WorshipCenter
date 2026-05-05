'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { transposeChordPro, detectKeyAccidental, transposeKey } from '@/lib/chordpro';
import { renderToBlocks } from '@/lib/chordpro';
import { ChordLine } from './ChordLine';
import { useTheme } from '@/components/theme/ThemeProvider';
import type { Theme } from '@/components/theme/ThemeProvider';

const FONT_STEPS = [16, 20, 24, 30, 40] as const;
const FONT_STEP_KEY = 'songdrop-font-step';

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
}

interface SongViewerProps {
  song: Song;
}

export function SongViewer({ song }: SongViewerProps) {
  const [semitones, setSemitones] = useState(0);
  const [fontStep, setFontStep] = useState(1);
  const [autoScroll, setAutoScroll] = useState(false);
  const { theme, setTheme } = useTheme();
  const articleRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number | null>(null);

  // Restore font step from localStorage
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(FONT_STEP_KEY) : null;
    if (stored !== null) {
      const n = parseInt(stored, 10);
      if (n >= 0 && n < FONT_STEPS.length) setFontStep(n);
    }
  }, []);

  // Persist font step
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(FONT_STEP_KEY, String(fontStep));
  }, [fontStep]);

  const accidental = useMemo(
    () => detectKeyAccidental(song.original_key),
    [song.original_key],
  );

  const blocks = useMemo(() => {
    const transposed = semitones !== 0
      ? transposeChordPro(song.body_chordpro, semitones, accidental)
      : song.body_chordpro;
    return renderToBlocks(transposed);
  }, [song.body_chordpro, semitones, accidental]);

  const currentKey = useMemo(
    () => semitones !== 0 ? transposeKey(song.original_key, semitones, accidental) : song.original_key,
    [song.original_key, semitones, accidental],
  );

  // Auto-scroll loop
  const scrollSpeed = song.bpm ? song.bpm / 200 : 0.5;
  useEffect(() => {
    if (!autoScroll) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const step = () => {
      window.scrollBy(0, scrollSpeed);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [autoScroll, scrollSpeed]);

  // Stop auto-scroll on click
  const handleArticleClick = useCallback(() => {
    if (autoScroll) setAutoScroll(false);
  }, [autoScroll]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      articleRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'stage-dark'];
    const next = themes[(themes.indexOf(theme) + 1) % themes.length]!;
    setTheme(next);
  };

  const fontSize = FONT_STEPS[fontStep] ?? 20;

  return (
    <article
      ref={articleRef}
      className="max-w-3xl mx-auto pb-24"
      onClick={handleArticleClick}
    >
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-(--color-bg)/90 backdrop-blur border-b border-(--color-border) px-4 py-3 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate" lang={song.language}>{song.title}</h1>
          <div className="flex items-center gap-3 text-xs text-(--color-muted-fg)">
            <span className="font-mono font-bold text-(--color-accent)">{currentKey}</span>
            {song.bpm && <span>{song.bpm} BPM</span>}
            {song.time_signature && <span>{song.time_signature}</span>}
          </div>
        </div>

        {/* Transpose controls */}
        <div className="flex items-center gap-1">
          <button
            aria-label="Transpose down"
            className="size-8 rounded-full border border-(--color-border) flex items-center justify-center text-sm font-bold hover:bg-(--color-muted)"
            onClick={(e) => { e.stopPropagation(); setSemitones((s) => s - 1); }}
          >−</button>
          <span className="text-xs font-mono w-8 text-center">
            {semitones > 0 ? `+${semitones}` : semitones}
          </span>
          <button
            aria-label="Transpose up"
            className="size-8 rounded-full border border-(--color-border) flex items-center justify-center text-sm font-bold hover:bg-(--color-muted)"
            onClick={(e) => { e.stopPropagation(); setSemitones((s) => s + 1); }}
          >+</button>
        </div>

        {/* Font size */}
        <div className="flex items-center gap-1">
          <button
            aria-label="Decrease font size"
            className="size-8 rounded-full border border-(--color-border) flex items-center justify-center text-sm hover:bg-(--color-muted)"
            onClick={(e) => { e.stopPropagation(); setFontStep((s) => Math.max(0, s - 1)); }}
          >A−</button>
          <button
            aria-label="Increase font size"
            className="size-8 rounded-full border border-(--color-border) flex items-center justify-center text-sm font-bold hover:bg-(--color-muted)"
            onClick={(e) => { e.stopPropagation(); setFontStep((s) => Math.min(FONT_STEPS.length - 1, s + 1)); }}
          >A+</button>
        </div>

        {/* Theme toggle */}
        <button
          aria-label={`Switch theme (current: ${theme})`}
          className="size-8 rounded-full border border-(--color-border) flex items-center justify-center text-xs hover:bg-(--color-muted)"
          onClick={(e) => { e.stopPropagation(); cycleTheme(); }}
        >
          {theme === 'stage-dark' ? '★' : theme === 'dark' ? '●' : '○'}
        </button>

        {/* Auto-scroll */}
        <button
          aria-label={autoScroll ? 'Stop autoscroll' : 'Start autoscroll'}
          className={`size-8 rounded-full border flex items-center justify-center text-xs hover:bg-(--color-muted) ${autoScroll ? 'border-(--color-accent) text-(--color-accent)' : 'border-(--color-border)'}`}
          onClick={(e) => { e.stopPropagation(); setAutoScroll((v) => !v); }}
        >▼</button>

        {/* Fullscreen */}
        <button
          aria-label="Toggle fullscreen"
          className="size-8 rounded-full border border-(--color-border) flex items-center justify-center text-xs hover:bg-(--color-muted)"
          onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
        >⛶</button>
      </header>

      {/* Song body */}
      <section className="px-4 pt-6" style={{ fontSize: `${fontSize}px` }}>
        {blocks.map((block, i) => (
          <ChordLine key={i} block={block} language={song.language} />
        ))}
      </section>

      {song.notes && (
        <aside className="px-4 pt-8 text-sm text-(--color-muted-fg)">
          <p className="font-semibold mb-1">Notes</p>
          <p className="whitespace-pre-wrap">{song.notes}</p>
        </aside>
      )}
    </article>
  );
}
