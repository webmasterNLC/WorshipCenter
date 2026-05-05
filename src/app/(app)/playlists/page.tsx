import { ListMusic } from 'lucide-react';

export default function PlaylistsComingSoonPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Playlists</h1>
      <div className="grid gap-3 rounded-2xl border border-(--color-border) p-6 text-(--color-muted-fg)">
        <ListMusic className="size-8 text-(--color-accent)" aria-hidden />
        <p className="text-base text-(--color-fg)">Coming soon.</p>
        <p className="text-sm">
          Playlist builder with per-song transposition, performance mode, and
          band sharing ship in the release after song management.
        </p>
      </div>
    </div>
  );
}
