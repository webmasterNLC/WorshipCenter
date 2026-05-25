'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { transposeChordPro, detectKeyAccidental, transposeKey } from '@/lib/chordpro';
import { renderToBlocks } from '@/lib/chordpro';
import { ChordLine } from './ChordLine';
import { useTheme } from '@/components/theme/ThemeProvider';
import type { Theme } from '@/components/theme/ThemeProvider';

const FONT_STEPS = [16, 20, 24, 30, 40] as const;
const FONT_STEP_KEY = 'songdrop-font-step';

const LANG_LABEL: Record<string, string> = {
  de: 'DE', en: 'EN', ta: 'TA',
};

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
  /** Optional — if present and length > 1, language switcher is shown. */
  translations?: Translation[];
}

interface SongViewerProps {
  song: Song;
  /** Pre-applied semitone offset (e.g. from playlist item). Default 0. */
  initialSemitones?: number;
  /** Optional navigation bar rendered above the sticky header. */
  navigationSlot?: React.ReactNode;
  /** If set, renders an Edit pencil button in the sticky header that links here. */
  editHref?: string;
}

function readStoredFontStep(): number {
  if (typeof window === 'undefined') return 1;
  const stored = localStorage.getItem(FONT_STEP_KEY);
  if (stored !== null) {
    const n = parseInt(stored, 10);
    if (n >= 0 && n < FONT_STEPS.length) return n;
  }
  return 1;
}

export function SongViewer({ song, initialSemitones = 0, navigationSlot, editHref }: SongViewerProps) {
  const [semitones, setSemitones] = useState(initialSemitones);
  // When the server prop updates (e.g. lead changed the playlist item's
  // transpose and Realtime triggered a router.refresh()), snap to it.
  useEffect(() => {
    setSemitones(initialSemitones);
  }, [initialSemitones]);
  const [fontStep, setFontStep] = useState(readStoredFontStep);
  const [autoScroll, setAutoScroll] = useState(false);
  const { theme, setTheme } = useTheme();
  const articleRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number | null>(null);

  // Translation tabs are visible only when there are 2+ translations.
  const translations = song.translations ?? [];
  const showLangSwitch = translations.length > 1;
  const initialLang =
    translations.find((t) => t.is_primary)?.language ?? song.language;
  const [activeLang, setActiveLang] = useState<string>(initialLang);

  const active =
    translations.find((t) => t.language === activeLang) ?? null;
  const effectiveTitle    = active?.title         ?? song.title;
  const effectiveLanguage = active?.language      ?? song.language;
  const effectiveBody     = active?.body_chordpro ?? song.body_chordpro;

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
      ? transposeChordPro(effectiveBody, semitones, accidental)
      : effectiveBody;
    return renderToBlocks(transposed);
  }, [effectiveBody, semitones, accidental]);

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
    const themes: Theme[] = ['light', 'stage-dark'];
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
      {navigationSlot}

      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-(--color-bg)/90 backdrop-blur border-b border-(--color-border) px-4 py-3 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-0">
          <h1
            className="font-display text-lg truncate"
            lang={effectiveLanguage}
          >
            {effectiveTitle}
          </h1>
          <div className="flex items-center gap-3 text-xs text-(--color-muted-fg)">
            <span className="font-mono font-bold text-(--color-accent)">{currentKey}</span>
            {song.bpm && <span>{song.bpm} BPM</span>}
            {song.time_signature && <span>{song.time_signature}</span>}
          </div>
        </div>

        {/* Transpose */}
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

        <button
          aria-label={`Switch theme (current: ${theme})`}
          className="size-8 rounded-full border border-(--color-border) flex items-center justify-center text-xs hover:bg-(--color-muted)"
          onClick={(e) => { e.stopPropagation(); cycleTheme(); }}
        >
          {theme === 'stage-dark' ? '★' : '○'}
        </button>

        <button
          aria-label={autoScroll ? 'Stop autoscroll' : 'Start autoscroll'}
          className={`size-8 rounded-full border flex items-center justify-center text-xs hover:bg-(--color-muted) ${autoScroll ? 'border-(--color-accent) text-(--color-accent)' : 'border-(--color-border)'}`}
          onClick={(e) => { e.stopPropagation(); setAutoScroll((v) => !v); }}
        >▼</button>

        <button
          aria-label="Toggle fullscreen"
          className="size-8 rounded-full border border-(--color-border) flex items-center justify-center text-xs hover:bg-(--color-muted)"
          onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
        >⛶</button>

        {editHref && (
          <Link
            href={editHref}
            aria-label="Edit song"
            onClick={(e) => e.stopPropagation()}
            className="size-8 rounded-full border border-(--color-border) flex items-center justify-center text-(--color-muted-fg) hover:border-(--color-accent) hover:text-(--color-accent) transition-colors"
          >
            <Pencil className="size-3.5" aria-hidden />
          </Link>
        )}
      </header>

      {/* Language switcher (only shown when 2+ translations exist) */}
      {showLangSwitch && (
        <div
          className="px-4 pt-3 flex flex-wrap items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[0.65rem] uppercase tracking-[0.22em] text-(--color-muted-fg) mr-1">
            Language
          </span>
          {translations.map((t) => {
            const isActive = t.language === activeLang;
            return (
              <button
                key={t.language}
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveLang(t.language); }}
                aria-pressed={isActive}
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.14em] transition-colors ${
                  isActive
                    ? 'border-(--color-accent) bg-(--color-accent) text-(--color-accent-fg)'
                    : 'border-(--color-border) text-(--color-muted-fg) hover:border-(--color-accent)'
                }`}
              >
                {t.is_primary && <span className="mr-1 text-(--color-accent-fg)">★</span>}
                {LANG_LABEL[t.language] ?? t.language.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}

      {/* Song body */}
      <section className="px-4 pt-6" style={{ fontSize: `${fontSize}px` }}>
        {blocks.map((block, i) => (
          <ChordLine key={i} block={block} language={effectiveLanguage} />
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
