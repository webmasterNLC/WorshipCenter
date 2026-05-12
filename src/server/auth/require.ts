// Pure logic for role-gating, with the Supabase-bound session loader injected.
// The `requireRole` helper exported by default uses the real loader.
import 'server-only';
import { cache } from 'react';
import { UnauthorizedError, ForbiddenError, NotFoundError } from './errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type UserRole = 'admin' | 'leader' | 'viewer';

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

// React's `cache()` scopes the result to a single request. Without it,
// layout → page → server-action chains each hit auth.getUser() + profiles
// SELECT independently (3-5× per request). With it: one auth round-trip
// and one profile lookup per request, shared across every callsite.
const loadSessionCached = cache(async (): Promise<Session | null> => {
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
});

const defaultLoader: SessionLoader = {
  loadSession: loadSessionCached,
};

export const requireRole = makeRequireRole(defaultLoader);
export const loadSession = loadSessionCached;

/**
 * Requires the caller to be a band member, then verifies they own the playlist
 * OR are an admin. Throws ForbiddenError otherwise.
 *
 * NOTE: in the new "Program" permission model this helper is being phased out
 * in favour of requireAdminOrAssignedLeader. Kept for legacy callers that
 * still need owner semantics.
 */
export async function requireOwnerOrAdmin(playlistId: string): Promise<Session> {
  const session = await requireRole('admin', 'leader', 'viewer');
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

/**
 * Admin can edit any program. A leader can edit a program ONLY if admin
 * has assigned them to that program's service rota. Used by song-list /
 * version writes on a Program.
 */
export async function requireAdminOrAssignedLeader(playlistId: string): Promise<Session> {
  const session = await requireRole('admin', 'leader');
  if (session.profile.role === 'admin') return session;
  // Leader: must appear in service_assignments for this playlist.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('service_assignments')
    .select('id')
    .eq('playlist_id', playlistId)
    .eq('member_id', session.profile.id)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ForbiddenError();
  return session;
}
