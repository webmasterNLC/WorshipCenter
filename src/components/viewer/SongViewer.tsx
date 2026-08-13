'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { transposeChordPro, detectKeyAccidental, transposeKey } from '@/lib/chordpro';
import { renderToBlocks } from '@/lib/chordpro';
import { ChordLine } from './ChordLine';
import { KeyDial } from './KeyDial';

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
  /** Called whenever the user transposes. Used by the performance viewer to
   *  broadcast the lead's adjustments back to the DB. */
  onSemitonesChange?: (semitones: number) => void;
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

export function SongViewer({ song, initialSemitones = 0, navigationSlot, editHref, onSemitonesChange }: SongViewerProps) {
  const [semitones, setSemitones] = useState(initialSemitones);
  // Single path for every transpose control (+/- buttons and the Key Dial),
  // so the broadcast callback fires no matter how the key was changed.
  const applyTranspose = (next: number) => {
    setSemitones(next);
    onSemitonesChange?.(next);
  };
  // When the server prop updates (e.g. lead changed the playlist item's
  // transpose and Realtime triggered a router.refresh()), snap to it.
  useEffect(() => {
    setSemitones(initialSemitones);
  }, [initialSemitones]);
  const [fontStep, setFontStep] = useState(readStoredFontStep);

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

  const fontSize = FONT_STEPS[fontStep] ?? 20;

  return (
    // The chosen size sits on the whole article, and the width cap is
    // expressed in em against it. A chord chart needs width in proportion to
    // its text: with a fixed 48rem cap, every step up in font size meant more
    // mid-line wrapping and, on a big display, a narrow column with the screen
    // unused either side. In em the cap tracks the text — 16px → 768px as
    // before, 40px → 1920px — so lines break in the same places at every size.
    // Header, language tabs and notes pin their own sizes, so they stay put.
    <article
      className="mx-auto pb-24"
      style={{ fontSize: `${fontSize}px`, maxWidth: '48em' }}
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

        {/* Transpose — the Key Dial, everywhere. The song page used to carry a
            separate +/- pair, which meant the same job had two different
            controls depending on how you got to the song. */}
        <KeyDial
          originalKey={song.original_key}
          semitones={semitones}
          accidental={accidental}
          currentKey={currentKey}
          onSet={applyTranspose}
        />

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
      <section className="px-4 pt-6">
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
