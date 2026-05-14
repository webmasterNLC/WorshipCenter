'use client';
import { Sun, Sparkles } from 'lucide-react';
import { useTheme, type Theme } from './ThemeProvider';

const ORDER: Theme[] = ['light', 'stage-dark'];
const LABEL: Record<Theme, string> = {
  light:        'Light',
  'stage-dark': 'Stage',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const idx = ORDER.indexOf(theme);
  const next = ORDER[(idx + 1) % ORDER.length] ?? 'light';

  const Icon = theme === 'light' ? Sun : Sparkles;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch theme (currently ${LABEL[theme]}, next ${LABEL[next]})`}
      title={`Theme: ${LABEL[theme]} → ${LABEL[next]}`}
      className="grid size-9 place-items-center rounded-full border border-(--color-border) text-(--color-muted-fg) hover:border-(--color-accent) hover:text-(--color-accent) transition-colors"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
