'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'stage-dark';
// Deliberately still 'songdrop-': the key names an existing value in every
// user's browser. Renaming them at the WorshipCenter rename would have reset
// theme, font size and follow-lead on all eight stage iPads for no gain —
// nobody ever reads a storage key.
const STORAGE_KEY = 'songdrop-theme';

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'light',
  setTheme: () => {},
});

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'stage-dark') return stored;
  return 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  useEffect(() => {
    document.documentElement.classList.remove('stage-dark');
    if (theme === 'stage-dark') document.documentElement.classList.add('stage-dark');
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);
  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
