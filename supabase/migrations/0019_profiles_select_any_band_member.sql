-- 0019_profiles_select_any_band_member.sql
-- Loosen profiles SELECT to all signed-in band members.
--
-- The previous policy was "own row only OR admin reads all". When the
-- rota UI joined member:profiles(display_name), a viewer saw only
-- their own name and "Unknown" for every other slot because RLS
-- filtered out everyone else's profile row.
--
-- profiles holds only display_name, role, created_at — none of those
-- are sensitive between band members. Email lives in auth.users and
-- is gated separately by gotrue. Loosening this read is the natural
-- privacy posture for a band roster.

drop policy if exists "profiles: read own + admin reads all" on profiles;

create policy "profiles: any band member reads" on profiles for select
  using (public.role_of((select auth.uid())) in ('admin','leader','viewer'));
