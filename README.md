# NLC Burgdorf SongDrop

Worship songs, chords, and setlists for NLC Burgdorf.

**Status:** Plan A — Foundation. Auth + invitations + admin.

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
- Supabase CLI (`pnpm exec supabase --version`)

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

Sign in with `SEED_ADMIN_EMAIL` (configured in `.env.local`). The dev seed lets you sign in via password; production uses magic-link only.

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

## Repo layout

See [`docs/superpowers/specs/2026-05-04-nlc-burgdorf-songdrop-design.md`](docs/superpowers/specs/2026-05-04-nlc-burgdorf-songdrop-design.md) for the full architecture spec.

## Security notes

- The service role key is only used in `src/server/...` and never imported by client code. CI greps the production bundle for `service_role` and fails if present.
- Authorization is enforced in three layers: Zod input validation, handler-side `requireRole` / `requireOwnerOrAdmin`, Postgres RLS.
- Custom SMTP via the church mail server. Configure once in `.env.local` and once in Supabase Dashboard → Auth → SMTP Settings.
