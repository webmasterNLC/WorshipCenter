# Plan A — Follow-ups from final code review

After Plan A's final code review (commit `79fe7a0`), some fixes were applied inline; others are tracked here for a follow-up plan or for Plan B's preamble.

## Already fixed (commit `<this commit's SHA>`)

- ✅ **eslint-plugin-security wired** into `eslint.config.mjs` with `recommended.rules`. CI now actually runs the security scan. (3 advisory warnings remain on `scripts/check-bundle.ts` filesystem reads — intentional.)
- ✅ **CSRF middleware tightened**: `Origin` header missing on POST/PUT/PATCH/DELETE now returns 403 (was previously waved through).
- ✅ **HSTS preload added** (`max-age=31536000; includeSubDomains; preload`).
- ✅ **Accept-invite race fixed**: the `accepted_at = now()` update is now an atomic conditional UPDATE with a `is('accepted_at', null)` guard. Concurrent clicks redirect the loser to `/sign-in?invite=already_used`.
- ✅ **`adminSetUserRole` now uses the request-scoped server client** for the role write (RLS-enforced). Admin client is reserved only for the `write_audit` RPC.
- ✅ **README updated** to Next.js 16 and Node 22.

## Still open — recommended for a Plan A.1 (security hardening) or Plan B preamble

### 1. CSP nonce-based script-src — currently `'unsafe-inline'` (CRITICAL per review)

Spec section 8 mandated `script-src 'self' 'nonce-{n}'`. Implementation ships `'unsafe-inline'`. To fix:
1. Generate a per-request nonce in `middleware.ts` (`crypto.randomUUID()` is fine for this).
2. Set `x-nonce` header on the response so server components can read it via `next/headers.headers()`.
3. Pass the nonce into `<script nonce={...}>` for any inline scripts (Next.js generates a few for hydration).
4. CSP becomes `script-src 'self' 'nonce-{nonce}' 'strict-dynamic'`.

The `'strict-dynamic'` keyword lets nonce'd scripts load dependencies without listing them.

### 2. Brute-force throttling on sign-in — `auth_attempts` table is unused (CRITICAL per review)

Spec: 10/IP/15min, 5/email/15min on sign-in attempts. To fix:
1. In `src/server/ratelimit/auth-attempts.ts`, add a Postgres function `check_auth_rate(p_email citext, p_ip inet)` that returns `boolean` based on counts within a 15-minute window.
2. Call it from `src/app/(auth)/sign-in/page.tsx#signInAction` BEFORE `signInWithOtp`. On rate-limit, return error.
3. Write a row on every attempt (succeeded true/false) via the admin client.

### 3. DoS amplification on `/api/invitations/accept` — bcrypt loop (CRITICAL per review)

Currently the route bcrypt-compares the supplied token against EVERY pending invitation (cost 12 ≈ 250ms each). 20 pending = 5s/request. Two viable mitigations:

- **HMAC prefix index** *(recommended)*: add a `token_prefix text` column = first 16 hex chars of HMAC-SHA256(token, server-secret). Index it. On accept, narrow candidates by `token_prefix = ?` (collisions ~1 in 2^64). Bcrypt only the matching row.
- **Per-IP rate limit** on the route via the same `auth_attempts` table — second-best because it doesn't fix the asymmetry, just slows it.

### 4. Single-use enforcement test coverage (IMPORTANT per review)

No test exercises the accept-invite handler with: expired token, already-accepted token, malformed token, or the new race-loser path. Add unit tests by extracting a pure `verifyAndConsume(candidates, token, now)` helper from `route.ts` and testing it.

### 5. Reflected error messages from Supabase (IMPORTANT per review)

`/sign-in?error={supabaseMessage}` and `/onboard?error={supabaseMessage}` echo provider error strings into the URL/page. Map known codes to fixed strings, render generic message on unknown, log details server-side.

### 6. `sendInvitation` does not de-duplicate (IMPORTANT per review)

Calling twice with the same email creates two pending rows. Either:
- Make `invitations_email_pending_idx` a UNIQUE index (`create unique index ... where accepted_at is null`).
- Or have the action expire/delete prior pending rows for the email before insert.

### 7. Action error boundaries (IMPORTANT per review)

Form-action wrappers in admin pages, sign-in, and onboard don't try/catch the typed errors. Thrown `ForbiddenError` etc. surface as Next's default error page. Wrap each action call with a try/catch that converts to a UI-friendly redirect with an error param.

### 8. Display-name auto-default leaks email local-part (MINOR per review)

`display_name: invitation.email.split('@')[0]` shows up in `/admin/users` until the user onboards. Use `'New user'` as the placeholder and surface the email-local-part only as a hint in the onboard form.

### 9. Plan/spec doc cleanup (MINOR per review)

- Plan listed `(auth)/accept-invite/page.tsx`; implementation correctly skips this (the email link goes straight to the API route). Update plan file structure.
- Plan still says "Next.js 15" in prose; actually Next 16. Update.

## Docker-blocked verifications (will run when Docker is installed)

These are not bugs — they're verification steps that need a live Supabase:
- `pnpm db:reset` — apply migrations
- `pnpm db:seed` — create first admin
- `pnpm test:rls` — 9 RLS policy matrix tests in `tests/rls/profiles.test.ts`
- `pnpm test:e2e` — Playwright auth-flow spec
- Manual demo walkthrough (sign-in → invite → revoke flow)

Once Docker is installed, run:
```bash
pnpm db:reset
pnpm db:seed
pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls && pnpm build && pnpm scan-bundle
pnpm test:e2e
```
All should pass, gated by env vars in `.env.local`.
