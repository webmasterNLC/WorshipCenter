// Pure validation for the two untrusted query params /api/auth/callback reads.
// Kept out of the route handler so both guards are directly testable.
import type { EmailOtpType } from '@supabase/supabase-js';

const OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

/**
 * Narrow an untrusted `type` query param to a Supabase OTP type.
 * Returns null for anything else — the caller must reject rather than guess.
 */
export function parseOtpType(value: string | null): EmailOtpType | null {
  if (value === null) return null;
  return OTP_TYPES.includes(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

/**
 * Resolve the post-sign-in destination, rejecting anything that could leave
 * this origin. `//evil.com` is protocol-relative and would be honoured by the
 * browser as an absolute URL, so a leading-slash check alone is not enough.
 */
export function safeNext(value: string | null, fallback = '/home'): string {
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  // A backslash is normalised to a forward slash by some browsers: /\evil.com
  if (value.startsWith('/\\')) return fallback;
  return value;
}
