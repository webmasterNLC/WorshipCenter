'use client';
import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';

interface Props {
  songTitle: string;
  onConfirm: () => Promise<void>;
}

export function DeleteSongButton({ songTitle, onConfirm }: Props) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  // Two-click confirm: first click "arms" the button, second click within
  // 5 seconds actually fires. Avoids a native confirm() that's clunky on
  // mobile and tells the admin exactly what they're about to delete.
  function handleClick() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 5000);
      return;
    }
    startTransition(async () => {
      await onConfirm();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        armed
          ? 'border-(--color-danger) bg-(--color-danger)/10 text-(--color-danger)'
          : 'border-(--color-border) text-(--color-muted-fg) hover:border-(--color-danger) hover:text-(--color-danger)'
      }`}
    >
      <Trash2 className="size-4" aria-hidden />
      {pending
        ? 'Deleting…'
        : armed
          ? `Tap again to delete "${songTitle}"`
          : 'Delete song'}
    </button>
  );
}
