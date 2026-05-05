'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'stage-dark';
const STORAGE_KEY = 'songdrop-theme';

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    const stored = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as Theme | null;
    if (stored === 'light' || stored === 'dark' || stored === 'stage-dark') setTheme(stored);
  }, []);
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'stage-dark');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else if (theme === 'stage-dark') document.documentElement.classList.add('stage-dark');
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);
  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
