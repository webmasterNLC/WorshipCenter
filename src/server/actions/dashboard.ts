import 'server-only';
import { requireRole } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface RecentSong {
  id: string;
  title: string;
  language: string;
  original_key: string;
  updated_at: string;
}

export interface NextService {
  id: string;
  name: string;
  scheduled_for: string;
  item_count: number;
}

export interface DashboardStats {
  songCount: number;
  playlistCount: number;
  nextService: NextService | null;
  recentSongs: RecentSong[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await requireRole('admin', 'leader', 'viewer');
  const sb = await createSupabaseServerClient();

  const today = new Date().toISOString().slice(0, 10);

  const [songsCountRes, playlistsCountRes, recentSongsRes, nextServiceRes] =
    await Promise.all([
      sb.from('songs').select('id', { count: 'exact', head: true }),
      sb.from('playlists').select('id', { count: 'exact', head: true }),
      sb
        .from('songs')
        .select('id, title, language, original_key, updated_at')
        .order('updated_at', { ascending: false })
        .limit(5),
      sb
        .from('playlists')
        .select('id, name, scheduled_for, playlist_items(count)')
        .gte('scheduled_for', today)
        .order('scheduled_for', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  let nextService: NextService | null = null;
  if (nextServiceRes.data && nextServiceRes.data.scheduled_for) {
    const itemsArr = nextServiceRes.data.playlist_items as
      | Array<{ count: number }>
      | null;
    const itemCount =
      Array.isArray(itemsArr) && itemsArr[0] != null
        ? Number(itemsArr[0].count)
        : 0;
    nextService = {
      id: nextServiceRes.data.id,
      name: nextServiceRes.data.name,
      scheduled_for: nextServiceRes.data.scheduled_for,
      item_count: itemCount,
    };
  }

  return {
    songCount: songsCountRes.count ?? 0,
    playlistCount: playlistsCountRes.count ?? 0,
    nextService,
    recentSongs: (recentSongsRes.data ?? []) as RecentSong[],
  };
}
