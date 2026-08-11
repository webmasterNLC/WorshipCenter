import 'server-only';

/**
 * Read a required environment variable, or throw naming it.
 *
 * Deliberately not `process.env.X!` — the non-null assertion is erased at
 * compile time, so a missing var travels on as `undefined` and surfaces much
 * later as something unrecognisable (nodemailer reports a missing SMTP
 * password as `EAUTH: Missing credentials for "PLAIN"`).
 *
 * Values are trimmed: a trailing newline pasted into a dashboard field is
 * invisible in the UI and fatal at runtime.
 */
export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Check the env vars for this environment ` +
        `(on Vercel, Preview and Production are configured separately, and ` +
        `changes only take effect after a redeploy).`,
    );
  }
  return value;
}

/**
 * Absolute origin for links we email to people — invitations, password resets,
 * email-change confirmations, playlist shares.
 *
 * Never derive this from request headers. `Host`/`X-Forwarded-Host` are
 * attacker-controlled, and a poisoned value turns a reset mail into a
 * credential-harvesting link pointed at someone else's server.
 *
 * Throws when unset rather than falling back to localhost: a link nobody can
 * open is worse than a failed send, because the failure is silent and the
 * recipient is the one who discovers it.
 */
export function appOrigin(): string {
  const value =
    process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) {
    throw new Error(
      'APP_ORIGIN is not set. Emailed links need an absolute origin — ' +
        'without it recipients get an unusable http://localhost:3000 URL.',
    );
  }
  // Strip trailing slashes so callers can concatenate `${origin}/path` safely.
  return value.replace(/\/+$/, '');
}
