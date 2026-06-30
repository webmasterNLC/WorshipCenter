'use client';
import { useState, useRef, useEffect } from 'react';
import {
  pitchClassFromRoot,
  normalizeSemitones,
  rootFromPitchClass,
  type Accidental,
} from '@/lib/chordpro';

interface KeyDialProps {
  /** The song's written key, e.g. "G", "Bb", "F#m". */
  originalKey: string;
  /** Current transpose offset in semitones (may be outside -6..6). */
  semitones: number;
  /** Sharp/flat preference for naming the keys on the ring. */
  accidental: Accidental;
  /** Pre-computed sounding key label (matches the rest of the viewer). */
  currentKey: string;
  /** Apply a new absolute semitone offset. */
  onSet: (semitones: number) => void;
}

// 12 chromatic positions on a ring, 12 o'clock = C (pitch class 0).
const RING = Array.from({ length: 12 }, (_, pc) => {
  const angle = (pc / 12) * 2 * Math.PI - Math.PI / 2;
  return { pc, x: 50 + 44 * Math.cos(angle), y: 50 + 44 * Math.sin(angle) };
});

/**
 * The Key Dial — the live transpose control on the performance view, and the
 * app's signature element: a chromatic pitch ring. Tap any note to jump the
 * whole song to that key. The trigger doubles as the brand mark (the small
 * navy ring glyph). ponytail: jumps land in -5..+6 semitones, which still
 * reaches all 12 keys; widen if a use case ever needs the literal octave.
 */
export function KeyDial({
  originalKey,
  semitones,
  accidental,
  currentKey,
  onSet,
}: KeyDialProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pcOrig = pitchClassFromRoot(originalKey) ?? 0;
  const pcCurrent = normalizeSemitones(pcOrig + semitones);
  const offsetLabel = semitones > 0 ? `+${semitones}` : String(semitones);

  function jumpTo(pc: number) {
    // Signed nearest offset from the written key — reaches every key in -5..+6.
    let d = normalizeSemitones(pc - pcOrig);
    if (d > 6) d -= 12;
    onSet(d);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Transpose — open key dial"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1.5 rounded-full border border-(--color-border) pl-3 pr-2 py-1 hover:border-(--color-accent) transition-colors"
      >
        <span className="font-mono font-bold text-(--color-accent) text-sm">{currentKey}</span>
        {semitones !== 0 && (
          <span className="text-[0.65rem] font-mono text-(--color-muted-fg) tabular-nums">
            {offsetLabel}
          </span>
        )}
        {/* The ring glyph — the signature mark, shrunk to a control affordance. */}
        <span className="relative size-3.5 rounded-full border-[1.5px] border-(--color-accent)">
          <span className="absolute -top-px left-1/2 size-1 -translate-x-1/2 rounded-full bg-(--color-accent)" />
        </span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 z-30 mt-2 rounded-2xl border border-(--color-border) bg-(--color-bg) p-4 shadow-[0_20px_40px_-24px_rgb(0_0_0/0.4)]"
        >
          <div className="relative size-56">
            {RING.map(({ pc, x, y }) => {
              const isCurrent = pc === pcCurrent;
              const isOriginal = pc === pcOrig;
              const name = rootFromPitchClass(pc, accidental);
              return (
                <button
                  key={pc}
                  type="button"
                  onClick={() => jumpTo(pc)}
                  aria-label={`Set key to ${name}`}
                  aria-pressed={isCurrent}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  className={`absolute size-10 -translate-x-1/2 -translate-y-1/2 rounded-full font-mono text-sm transition-colors ${
                    isCurrent
                      ? 'bg-(--color-accent) font-bold text-(--color-accent-fg)'
                      : 'border border-(--color-border) text-(--color-fg) hover:border-(--color-accent)'
                  }`}
                >
                  {name}
                  {isOriginal && !isCurrent && (
                    <span
                      className="absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-(--color-accent)"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
            {/* Center hub — current sounding key + offset. */}
            <div className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-(--color-border) bg-(--color-muted)">
              <span className="numeral text-3xl leading-none">{currentKey}</span>
              <span className="mt-0.5 text-[0.6rem] uppercase tracking-[0.18em] text-(--color-muted-fg) tabular-nums">
                {semitones === 0 ? 'Original' : `${offsetLabel} st`}
              </span>
            </div>
          </div>
          {semitones !== 0 && (
            <button
              type="button"
              onClick={() => onSet(0)}
              className="mt-3 w-full rounded-lg border border-(--color-border) py-1.5 text-xs uppercase tracking-[0.14em] text-(--color-muted-fg) hover:border-(--color-accent) hover:text-(--color-accent) transition-colors"
            >
              Reset to {originalKey}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
