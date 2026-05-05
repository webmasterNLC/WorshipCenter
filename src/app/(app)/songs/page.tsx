import { Music } from 'lucide-react';

export default function SongsComingSoonPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Songs</h1>
      <div className="grid gap-3 rounded-2xl border border-(--color-border) p-6 text-(--color-muted-fg)">
        <Music className="size-8 text-(--color-accent)" aria-hidden />
        <p className="text-base text-(--color-fg)">Coming soon.</p>
        <p className="text-sm">
          Song management, multilingual lyrics (German, English, Tamil), and the
          chord transposition engine ship in the next release.
        </p>
      </div>
    </div>
  );
}
