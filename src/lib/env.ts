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
 * Falls back to the origin Vercel reports for the project, then throws. Never
 * to localhost: a link nobody can open is worse than a failed send, because
 * the failure is silent and the recipient is the one who discovers it.
 */
export function appOrigin(): string {
  const configured =
    process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return stripTrailingSlash(configured);

  // VERCEL_PROJECT_PRODUCTION_URL is the project's stable production domain,
  // supplied by the platform. Deliberately not VERCEL_URL, which is unique per
  // deployment: an invitation mailed today would point at a build that gets
  // superseded tomorrow. Preview deployments report the production domain too,
  // which is what we want — a recipient should land on the real app, not on a
  // branch build behind the SSO wall.
  //
  // This exists because a missing APP_ORIGIN has now broken invitations twice:
  // once mailing http://localhost:3000, once failing the send outright. The
  // platform knows the answer, so asking it beats requiring a manual step that
  // has demonstrably not survived contact with a deploy.
  const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (fromVercel) {
    return stripTrailingSlash(
      fromVercel.startsWith('http') ? fromVercel : `https://${fromVercel}`,
    );
  }

  throw new Error(
    'APP_ORIGIN is not set and no Vercel production URL is available. ' +
      'Emailed links need an absolute origin — without one recipients get an ' +
      'unusable http://localhost:3000 URL.',
  );
}

/** So callers can concatenate `${origin}/path` without a double slash. */
function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
