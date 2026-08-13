# NLC Burgdorf WorshipCenter

Worship songs, chords, and setlists for NLC Burgdorf.

**Status:** v1 (Plan A — Foundation). Auth + invitations + admin. Deployable to Vercel.

## Stack

- Next.js 16 (App Router) with React Server Components
- TypeScript (strict, `noUncheckedIndexedAccess`)
- Tailwind v4 (light/dark themes)
- Supabase (Postgres, Auth, Row-Level Security)
- `@supabase/ssr` for Next.js cookie-bound auth
- `nodemailer` for SMTP (church mail server)
- Vitest + fast-check (unit) · Playwright (E2E)

## Prerequisites

- Node 22 (`.nvmrc` is set; run `nvm use`)
- `pnpm` 9+
- Docker (for the local Supabase stack)
- Supabase CLI — install globally: `brew install supabase/tap/supabase` (or see [supabase.com/docs/guides/local-development/cli/getting-started](https://supabase.com/docs/guides/local-development/cli/getting-started)). Verify with `supabase --version`.

## Setup

```bash
pnpm install
pnpm db:start          # boots Postgres + Supabase Studio in Docker
cp .env.example .env.local
# Fill .env.local with values printed by `pnpm db:start`.
pnpm db:reset          # applies all migrations
pnpm db:seed           # creates the seeded admin user
pnpm dev               # http://localhost:3000
```

Sign in with `SEED_ADMIN_EMAIL` and `SEED_PASSWORD` (configured in `.env.local`). Sign-in is email + password. New users land via an invitation email and set their own password during onboarding.

## Common commands

```bash
pnpm dev              # development server
pnpm build            # production build
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test             # unit tests
pnpm test:rls         # integration tests against local Supabase
pnpm test:e2e         # playwright
pnpm scan-bundle      # fail if service_role leaks to client bundle
pnpm db:reset         # rebuild local DB from migrations
pnpm db:seed          # idempotent seed
```

## Deploy to Vercel (v1 / Plan A)

This is everything you need to put the foundation online.

### 1. Create a hosted Supabase project

- https://supabase.com → New Project (free tier is fine).
- From Project Settings → API, capture three values:
  - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (server-only, keep secret)

### 2. Apply the migrations

In Supabase Dashboard → SQL Editor, paste and run each file in order:

1. `supabase/migrations/0001_init.sql` — tables
2. `supabase/migrations/0002_functions.sql` — `auth.role_of` + `write_audit`
3. `supabase/migrations/0003_rls.sql` — Row-Level Security policies

### 3. Seed the first admin

In Supabase Dashboard:

1. Authentication → Users → "Add user" → enter your email + password.
2. Copy the new user's UUID.
3. SQL Editor:
   ```sql
   insert into profiles (id, display_name, role)
   values ('<uuid-from-auth.users>', 'Admin', 'admin');
   ```

### 4. Configure custom SMTP for invitation emails

Supabase's outbound SMTP is **not** required — sign-in is email + password,
and invitation emails are sent by our app via `nodemailer` using the Vercel
env vars below. You only need Supabase SMTP if you later re-enable
magic-link / password-reset flows in the dashboard.

### 5. Push to Vercel

- https://vercel.com/new → Import the GitHub repo.
- Set Production environment variables:

  | Variable | Source |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | Supabase API settings |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API settings |
  | `SUPABASE_SERVICE_ROLE_KEY` | Supabase API settings (secret) |
  | `APP_ORIGIN` | `https://<your-vercel-app>.vercel.app` |
  | `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | church mail server |
  | `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | mailbox creds + sender |

  Skip the `SEED_*` vars — they're only used by the local seed script.

### 6. Wire the redirect

After the first deploy, in Supabase Dashboard → Authentication → URL
Configuration:

- **Site URL**: your Vercel domain
- **Redirect URLs**: add `https://<your-domain>/api/auth/callback`

Without this, the magic-link callback fails.

### What ships in this v1

- Sign-in via email + password.
- Admin can invite + revoke users via `/admin/invites`.
- Admin can change roles via `/admin/users`.
- Role-aware home, profile editing at `/me`.
- All RLS policies live; non-admins get 403 on `/admin/*`.
- `/songs` and `/playlists` are "coming soon" stubs — Plan B & C.
- Search engine indexing blocked via `public/robots.txt` (invite-only app).

## Repo layout

See [`docs/superpowers/specs/2026-05-04-nlc-burgdorf-songdrop-design.md`](docs/superpowers/specs/2026-05-04-nlc-burgdorf-songdrop-design.md) for the full architecture spec.

Implementation plans:
- [`docs/superpowers/plans/2026-05-04-plan-a-foundation.md`](docs/superpowers/plans/2026-05-04-plan-a-foundation.md) — shipped
- [`docs/superpowers/plans/2026-05-04-plan-a-followups.md`](docs/superpowers/plans/2026-05-04-plan-a-followups.md) — security hardening (folded into Plan B Phase 0)
- [`docs/superpowers/plans/2026-05-04-plan-b-song-system.md`](docs/superpowers/plans/2026-05-04-plan-b-song-system.md) — songs + chord engine + viewer + editor (queued)

## Stage iPads (shared performance devices)

The 8 stage iPads run the worship viewer (`/playlists/[id]/play/[idx]`)
during the service. Recommended setup:

- **One dedicated "Stage" account**, role `viewer` (the default — read-only
  on songs, no rota editing). All iPads sign in as that account. No
  schema change needed.
- Per-musician notes and transpose are a "practice at home" feature.
  The shared stage iPad is the wrong place for them.
- Font size + theme are per-device (localStorage), so each iPad can pick
  its own without affecting the others.
- The viewer subscribes to Supabase Realtime on `playlist_items` —
  when the worship lead edits a song's transpose / order / notes, every
  iPad refreshes within ~1s. A **Follow-Lead** toggle (radio icon in
  the performance navbar) lets an individual musician break out to a
  different key without the next refresh yanking them back; toggling it
  back on snaps to the lead's current state.

To create the Stage account: invite it like any other user from
`/admin/invites`, accept the invitation on one iPad, copy the password
to the other 7. Keep the role at the default `musician`.

## Security notes

- The service role key is only used in `src/server/...` and never imported by client code. CI greps the production bundle for `service_role` and fails if present.
- Authorization is enforced in three layers: Zod input validation, handler-side `requireRole` / `requireOwnerOrAdmin`, Postgres RLS.
- Custom SMTP via the church mail server. Configure once in `.env.local` and once in Supabase Dashboard → Auth → SMTP Settings.

