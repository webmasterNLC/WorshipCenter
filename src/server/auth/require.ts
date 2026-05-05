// Pure logic for role-gating, with the Supabase-bound session loader injected.
// The `requireRole` helper exported by default uses the real loader.
import 'server-only';
import { UnauthorizedError, ForbiddenError, NotFoundError } from './errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type UserRole = 'admin' | 'leader' | 'musician';

export interface Profile {
  id: string;
  display_name: string;
  role: UserRole;
  created_at: string;
}

export interface Session {
  user: { id: string };
  profile: Profile;
}

export interface SessionLoader {
  loadSession(): Promise<Session | null>;
}

export function makeRequireRole(loader: SessionLoader) {
  return async function requireRole(...allowed: [UserRole, ...UserRole[]]): Promise<Session> {
    const session = await loader.loadSession();
    if (!session) throw new UnauthorizedError();
    if (allowed.length === 0 || !allowed.includes(session.profile.role)) {
      throw new ForbiddenError();
    }
    return session;
  };
}

// Default loader — talks to Supabase via the request-scoped server client.
const defaultLoader: SessionLoader = {
  async loadSession() {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, role, created_at')
      .eq('id', user.id)
      .single();
    if (!profile) return null;
    return { user: { id: user.id }, profile: profile as Profile };
  },
};

export const requireRole = makeRequireRole(defaultLoader);
export const loadSession = defaultLoader.loadSession.bind(defaultLoader);

/**
 * Requires the caller to be a band member, then verifies they own the playlist
 * OR are an admin. Throws ForbiddenError otherwise.
 */
export async function requireOwnerOrAdmin(playlistId: string): Promise<Session> {
  const session = await requireRole('admin', 'leader', 'musician');
  if (session.profile.role === 'admin') return session;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('playlists')
    .select('owner_id')
    .eq('id', playlistId)
    .single();
  if (error || !data) throw new NotFoundError('Playlist');
  if (data.owner_id !== session.profile.id) throw new ForbiddenError();
  return session;
}
