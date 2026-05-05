'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowUpDown } from 'lucide-react';

interface Song {
  id: string;
  title: string;
  /** Primary language (used for the title's lang attribute and as the default sort tie-breaker). */
  language: string;
  /** All languages this song is available in (always includes `language`). */
  languages: string[];
  original_key: string;
  bpm: number | null;
  tags: string[];
  updated_at: string;
}

const LANG_LABEL: Record<string, string> = { de: 'Deutsch', en: 'English', ta: 'தமிழ்' };
const LANGS = ['de', 'en', 'ta'] as const;

export function SongsListClient({ songs }: { songs: Song[] }) {
  const [query, setQuery] = useState('');
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = songs;
    if (q) out = out.filter((s) => s.title.toLowerCase().includes(q));
    if (activeLang) out = out.filter((s) => s.languages.includes(activeLang));
    if (sort === 'alpha') {
      out = [...out].sort((a, b) => a.title.localeCompare(b.title));
    }
    return out;
  }, [songs, query, activeLang, sort]);

  const langCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of songs) {
      for (const lang of s.languages) {
        c[lang] = (c[lang] ?? 0) + 1;
      }
    }
    return c;
  }, [songs]);

  return (
    <div className="grid gap-5">
      {/* Filter bar */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-muted-fg)" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title…"
            className="w-full rounded-xl border border-(--color-border) bg-(--color-bg) pl-10 pr-4 py-2.5 text-sm focus:border-(--color-accent) focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveLang(null)}
            className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition-colors ${
              activeLang === null
                ? 'border-(--color-accent) bg-(--color-accent) text-(--color-accent-fg)'
                : 'border-(--color-border) text-(--color-muted-fg) hover:border-(--color-accent)'
            }`}
          >
            All · {songs.length}
          </button>
          {LANGS.map((lang) => {
            const count = langCounts[lang] ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={lang}
                type="button"
                onClick={() => setActiveLang(activeLang === lang ? null : lang)}
                className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition-colors ${
                  activeLang === lang
                    ? 'border-(--color-accent) bg-(--color-accent) text-(--color-accent-fg)'
                    : 'border-(--color-border) text-(--color-muted-fg) hover:border-(--color-accent)'
                }`}
              >
                {LANG_LABEL[lang] ?? lang} · {count}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setSort(sort === 'recent' ? 'alpha' : 'recent')}
          className="flex items-center gap-2 rounded-xl border border-(--color-border) px-3 py-2 text-xs uppercase tracking-[0.14em] text-(--color-muted-fg) hover:border-(--color-accent) hover:text-(--color-accent)"
          aria-label="Toggle sort"
        >
          <ArrowUpDown className="size-3.5" aria-hidden />
          {sort === 'recent' ? 'Recent' : 'A–Z'}
        </button>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-(--color-border) p-6 text-sm text-(--color-muted-fg)">
          {query || activeLang ? 'No songs match these filters.' : 'No songs yet.'}
        </p>
      ) : (
        <ul className="grid gap-2">
          {filtered.map((song) => (
            <li key={song.id}>
              <Link
                href={`/songs/${song.id}`}
                className="card-lift grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-(--color-border) px-4 py-3.5 hover:border-(--color-accent)"
              >
                <div className="min-w-0">
                  <p className="font-display text-lg truncate" lang={song.language}>
                    {song.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--color-muted-fg)">
                    <span className="flex items-center gap-1">
                      {song.languages.map((lang) => (
                        <span
                          key={lang}
                          className={`rounded-md px-1.5 py-0.5 uppercase tracking-[0.14em] ${
                            lang === song.language
                              ? 'bg-(--color-accent)/15 text-(--color-accent)'
                              : 'bg-(--color-muted)'
                          }`}
                        >
                          {lang}
                        </span>
                      ))}
                    </span>
                    <span className="font-mono tracking-wide text-(--color-fg)">
                      {song.original_key}
                    </span>
                    {song.bpm != null && (
                      <span className="font-mono tracking-wide">{song.bpm} bpm</span>
                    )}
                    {song.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-full border border-(--color-border) px-2 py-0.5">
                        {t}
                      </span>
                    ))}
                    {song.tags.length > 3 && (
                      <span className="text-(--color-muted-fg)">+{song.tags.length - 3}</span>
                    )}
                  </div>
                </div>
                <span className="text-(--color-muted-fg) text-sm">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
