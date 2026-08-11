import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * How the *current* session was established, as method names.
 *
 * Supabase records this as the `amr` claim inside the access token, so it is
 * signed by the auth server and cannot be forged by a client holding a stolen
 * session cookie — unlike a marker cookie we would set ourselves, which any
 * HTTP client can simply attach to its own request.
 *
 * The claim comes in two shapes depending on server version and custom access
 * token hooks: `['password']` or `[{ method: 'password', timestamp }]`.
 */
export async function sessionAuthMethods(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  const entries = data?.currentAuthenticationMethods ?? [];
  return entries.map((e) => (typeof e === 'string' ? e : e.method));
}

/**
 * True when a password was used to establish this session.
 *
 * Such a session proves knowledge of the *current* password, not access to the
 * account's inbox — so it must not be allowed to set a new password without
 * re-entering the old one. Sessions from an emailed link (`otp`, `magiclink`)
 * did prove inbox access moments ago, which is exactly what recovery and
 * invitation onboarding rely on.
 *
 * ponytail: deliberately fails open — an absent/unrecognised `amr` reads as
 * "not a password session" and is allowed through, preserving today's
 * behaviour. Closing that would risk dead-ending real recovery users, who by
 * definition cannot supply the old password. The realistic attack (a stolen
 * cookie from an ordinary sign-in) carries `password` and is caught.
 */
export function usedPassword(methods: string[]): boolean {
  return methods.includes('password');
}
