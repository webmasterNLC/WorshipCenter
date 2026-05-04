# Plan A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Next.js 15 + Supabase app where an admin can invite a user, the user accepts via emailed magic link, signs in, lands on a role-aware home page. RLS active, CI green.

**Architecture:** Next.js 15 App Router on Vercel. Supabase Postgres with Row-Level Security as the second authorization wall. Custom invitation flow (bcrypt-hashed tokens, SMTP via `nodemailer` to the church mail server). React Server Components for reads, Server Actions for writes. No client-side Supabase queries.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict + `noUncheckedIndexedAccess`), Tailwind v4, Supabase (Postgres + Auth + RLS), `@supabase/ssr`, `nodemailer`, `bcryptjs`, `zod`, `lucide-react`, Vitest, fast-check, Playwright.

**Reference spec:** [`docs/superpowers/specs/2026-05-04-nlc-burgdorf-songdrop-design.md`](../specs/2026-05-04-nlc-burgdorf-songdrop-design.md)

**Demo at the end:** Run `pnpm dev`, log in as the seeded admin, send an invite to a real email, click the email link, complete onboarding, sign back in. Admin can change roles. RLS blocks a non-admin from `/admin/*`.

**Out of scope (deferred to Plan B/C):** songs, transposition, viewer, editor, playlists, sharing, design system polish (stage-dark theme, Noto Sans Tamil font), audit-log UI.

---

## File Structure

```
.
├── README.md                                NEW
├── package.json                             NEW
├── pnpm-lock.yaml                           NEW (after install)
├── tsconfig.json                            NEW
├── next.config.ts                           NEW
├── postcss.config.mjs                       NEW
├── eslint.config.mjs                        NEW
├── .env.example                             NEW
├── .gitignore                               EXISTS — append Next/Node entries
├── .github/workflows/
│   ├── ci.yml                               NEW
│   └── scan-bundle.yml                      NEW
├── supabase/
│   ├── config.toml                          NEW (via supabase init)
│   ├── migrations/
│   │   ├── 0001_init.sql                    NEW
│   │   ├── 0002_rls.sql                     NEW
│   │   └── 0003_functions.sql               NEW
│   └── seed.sql                             NEW (Plan A: 1 admin user only)
├── scripts/
│   ├── seed.ts                              NEW
│   └── check-bundle.ts                      NEW
├── src/
│   ├── app/
│   │   ├── layout.tsx                       NEW
│   │   ├── globals.css                      NEW
│   │   ├── page.tsx                         NEW (redirects to /home or /sign-in)
│   │   ├── (auth)/
│   │   │   ├── layout.tsx                   NEW
│   │   │   ├── sign-in/page.tsx             NEW
│   │   │   ├── accept-invite/page.tsx       NEW
│   │   │   └── onboard/page.tsx             NEW
│   │   ├── (app)/
│   │   │   ├── layout.tsx                   NEW (auth-gated shell)
│   │   │   ├── home/page.tsx                NEW (role-aware)
│   │   │   ├── admin/
│   │   │   │   ├── layout.tsx               NEW (admin-gated)
│   │   │   │   ├── users/page.tsx           NEW
│   │   │   │   └── invites/page.tsx         NEW
│   │   │   └── me/page.tsx                  NEW (display-name editing)
│   │   └── api/
│   │       ├── auth/callback/route.ts       NEW
│   │       └── invitations/accept/route.ts  NEW
│   ├── components/
│   │   └── layout/
│   │       ├── AppShell.tsx                 NEW
│   │       ├── BottomNav.tsx                NEW
│   │       ├── SideRail.tsx                 NEW
│   │       └── TopBar.tsx                   NEW
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts                    NEW
│   │   │   ├── client.ts                    NEW
│   │   │   └── admin.ts                     NEW
│   │   ├── email/
│   │   │   ├── transport.ts                 NEW
│   │   │   ├── templates/invitation.ts      NEW
│   │   │   └── __tests__/transport.test.ts  NEW
│   │   └── invitations/
│   │       ├── token.ts                     NEW
│   │       └── __tests__/token.test.ts      NEW
│   ├── server/
│   │   ├── auth/
│   │   │   ├── errors.ts                    NEW
│   │   │   ├── require.ts                   NEW
│   │   │   └── __tests__/require.test.ts    NEW
│   │   └── actions/
│   │       ├── invitations.ts               NEW
│   │       ├── invitations.schemas.ts       NEW
│   │       ├── profile.ts                   NEW
│   │       ├── profile.schemas.ts           NEW
│   │       └── __tests__/
│   │           ├── invitations.test.ts      NEW
│   │           └── profile.test.ts          NEW
│   └── middleware.ts                        NEW
├── tests/
│   └── rls/
│       ├── helpers.ts                       NEW
│       └── profiles.test.ts                 NEW
├── e2e/
│   ├── playwright.config.ts                 NEW
│   └── auth-flow.spec.ts                    NEW
└── vitest.config.ts                         NEW
```

**File responsibilities:**
- `src/lib/supabase/*` — Supabase client factories (server with cookies, browser, admin with service role). Never imported from each other; pure factories.
- `src/lib/email/*` — SMTP transport + templates. Dependency-injected for tests.
- `src/lib/invitations/token.ts` — pure functions: `generateInvitationToken()`, `hashToken(raw)`, `compareToken(raw, hash)`. No I/O.
- `src/server/auth/*` — server-only authorization. Throws typed errors caught at the action boundary.
- `src/server/actions/*` — Server Actions grouped by entity. Each has its `.schemas.ts` neighbor.
- `src/app/api/*` — Route handlers, only for things Server Actions can't express (the invite-accept link arrives as a GET).
- `src/components/layout/*` — Layout chrome. Server components except where they need state.
- `src/middleware.ts` — Session refresh + security headers + Origin/Host equality check.
- `tests/rls/*` — RLS integration tests run against a real local Supabase. Separate from unit tests by directory.

---

## Conventions used in this plan

- **Package manager: `pnpm`.** All commands shown use `pnpm`. If the engineer prefers npm/yarn, substitute.
- **Test runner: Vitest** (unit + RLS integration), **Playwright** (E2E).
- **Commit style:** Conventional Commits (`feat:`, `chore:`, `test:`, `fix:`, `docs:`). Frequent commits at logical boundaries — usually one commit per task, sometimes one per pair of related tasks.
- **Git author:** local repo config will be used. The session's user has set this externally.
- **TDD discipline:** for non-boilerplate code, always write the test first, watch it fail, then implement. Boilerplate setup (config files, scaffolding) is exempt.
- **Verifying steps:** every step that says "run X" includes the *expected output*. If the actual output differs, stop and investigate before continuing.

---

## Phase 0 — Project setup

### Task 1: Initialize Next.js 15 with TypeScript + Tailwind v4

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Create the app via the official template**

Run from `/Users/lankanesan/dev-songdrop`:
```bash
pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack
```

Answer "Yes" to "would you like to use Tailwind CSS?", "Yes" to "src/", "Yes" to "App Router", "No" to "Turbopack" (we'll add later if needed), "Yes" to "import alias `@/*`".

Expected: Files created. May warn about non-empty directory (because we have `docs/`, `.gitignore`, `.git/`) — choose "yes, continue".

- [ ] **Step 2: Verify the dev server starts**

```bash
pnpm dev
```

Expected: `▲ Next.js 15.x.x` ... `Local: http://localhost:3000`. Open that URL, confirm the Next.js welcome page renders. Stop the dev server (Ctrl-C).

- [ ] **Step 3: Pin TypeScript to strict + `noUncheckedIndexedAccess`**

Open `tsconfig.json` and ensure `compilerOptions` contains:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Run typecheck to confirm green**

```bash
pnpm exec tsc --noEmit
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs next-env.d.ts src/ public/ .gitignore
git commit -m "chore: scaffold next.js 15 app with strict typescript and tailwind v4"
```

---

### Task 2: Install runtime + dev dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
pnpm add @supabase/ssr @supabase/supabase-js zod bcryptjs nodemailer lucide-react
pnpm add -D @types/bcryptjs @types/nodemailer
```

Expected: dependencies in `package.json`. No errors.

- [ ] **Step 2: Install dev/test dependencies**

```bash
pnpm add -D vitest @vitest/coverage-v8 fast-check happy-dom @testing-library/react @testing-library/jest-dom @vitejs/plugin-react eslint-plugin-security prettier @playwright/test
pnpm exec playwright install --with-deps chromium
```

Expected: all installs succeed. Playwright will download Chromium (~150 MB).

- [ ] **Step 3: Add npm scripts to `package.json`**

In `package.json`, replace the `"scripts"` block with:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:rls": "vitest run --config vitest.rls.config.ts",
    "test:e2e": "playwright test --config e2e/playwright.config.ts",
    "scan-bundle": "tsx scripts/check-bundle.ts",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:reset": "supabase db reset",
    "db:seed": "tsx scripts/seed.ts",
    "format": "prettier --write ."
  }
}
```

Add `tsx` for running TS scripts:
```bash
pnpm add -D tsx
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install runtime and test dependencies"
```

---

### Task 3: Project structure + .env.example + extended .gitignore

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `src/server/`, `src/lib/`, `tests/rls/`, `e2e/`, `scripts/` (just the directories)

- [ ] **Step 1: Create all source directories**

```bash
mkdir -p src/server/auth src/server/actions/__tests__ src/server/auth/__tests__ \
         src/lib/supabase src/lib/email/templates src/lib/email/__tests__ \
         src/lib/invitations/__tests__ src/components/layout \
         tests/rls e2e scripts
```

- [ ] **Step 2: Create `.env.example`**

Create file `/Users/lankanesan/dev-songdrop/.env.example`:
```bash
# --- Supabase ---
# Local: pnpm db:start prints these.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-start>

# --- App ---
# Origin used for invitation accept links.
APP_ORIGIN=http://localhost:3000

# --- SMTP (church mail server) ---
SMTP_HOST=mail.example.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.org
SMTP_PASSWORD=<smtp-password>
SMTP_FROM="NLC Burgdorf SongDrop <noreply@example.org>"

# --- Seed (dev only) ---
SEED_ADMIN_EMAIL=admin@nlc-burgdorf.local
SEED_ADMIN_DISPLAY_NAME=Admin
SEED_PASSWORD=<dev-only-password-min-12-chars>

# --- Test ---
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

- [ ] **Step 3: Append Next.js / Supabase entries to `.gitignore`**

Open `.gitignore` and ensure these lines are present (append any missing):
```
# Local Claude Code state
.claude/

# Node / Next.js
node_modules/
.next/
out/
dist/
build/

# Env files
.env
.env.local
.env.*.local

# Test artifacts
coverage/
playwright-report/
test-results/

# Editor
.vscode/
.idea/
*.swp
.DS_Store

# Supabase local
supabase/.branches/
supabase/.temp/
```

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add env template and project directory layout"
```

---

### Task 4: Vitest configuration

**Files:**
- Create: `vitest.config.ts`, `vitest.rls.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Create `vitest.config.ts`** (unit tests, jsdom-like env)

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    exclude: ['tests/rls/**', 'e2e/**', 'node_modules/**'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 2: Create `vitest.rls.config.ts`** (integration tests, node env, no setupFiles)

```ts
// vitest.rls.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/rls/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 3: Create `tests/setup.ts`** (testing-library matchers)

```ts
// tests/setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Verify Vitest can boot**

```bash
pnpm test
```

Expected: `No test files found` (no error). Exit 0 (or 1 with that message; either is acceptable as long as Vitest itself ran).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts vitest.rls.config.ts tests/setup.ts
git commit -m "chore: configure vitest for unit and RLS integration tests"
```

---

## Phase 1 — Database

### Task 5: Initialize Supabase locally

**Files:**
- Create: `supabase/config.toml` (via CLI)

- [ ] **Step 1: Install Supabase CLI** (per-project, dev dependency)

```bash
pnpm add -D supabase
```

- [ ] **Step 2: Initialize**

```bash
pnpm exec supabase init
```

Answer "n" to "Generate VS Code settings" if prompted; "n" to "Generate IntelliJ settings".
Expected: `supabase/config.toml` and `supabase/seed.sql` created.

- [ ] **Step 3: Start the local stack**

```bash
pnpm db:start
```

Expected: Docker pulls Postgres + studio + auth images on first run (3–5 min). Outputs API URL, DB URL, anon key, service-role key.

- [ ] **Step 4: Copy keys into `.env.local`**

Create `.env.local` (NOT committed) with the values from `pnpm db:start` output. Use `.env.example` as the template; replace each `<...>` placeholder with the printed value. Set `SEED_PASSWORD` to a real 12+ char string for dev only.

- [ ] **Step 5: Commit `supabase/` (skip `.branches`, `.temp`)**

```bash
git add supabase/config.toml
git commit -m "chore: initialize supabase local dev environment"
```

---

### Task 6: Migration 0001 — base tables

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0001_init.sql`:
```sql
-- 0001_init.sql — base tables for Plan A (auth foundation + future-ready song/playlist tables added in Plan B/C).
-- Plan A only enables RLS on tables it actually uses, but tables get created together to keep migration count low.

create extension if not exists "citext";
create extension if not exists "pgcrypto";

-- Roles
create type user_role as enum ('admin', 'leader', 'musician');

-- profiles: 1:1 with auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role user_role not null default 'musician',
  created_at timestamptz not null default now()
);

-- invitations: admin-issued, single-use
create table invitations (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  role user_role not null,
  invited_by uuid not null references profiles(id),
  token_hash text not null,                  -- bcrypt hash; raw token only sent via email
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_email_pending_idx on invitations (email) where accepted_at is null;
create index invitations_token_hash_idx on invitations (token_hash);

-- audit log
create table audit_log (
  id bigserial primary key,
  actor_id uuid not null references profiles(id),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_at_idx on audit_log (created_at desc);

-- auth attempts (rate-limit signin)
create table auth_attempts (
  id bigserial primary key,
  email citext,
  ip inet,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_email_idx on auth_attempts (email, created_at desc);
create index auth_attempts_ip_idx on auth_attempts (ip, created_at desc);
```

- [ ] **Step 2: Apply the migration**

```bash
pnpm exec supabase db reset
```

Expected: "Resetting local database..." then "Finished". No errors.

- [ ] **Step 3: Verify tables exist**

```bash
pnpm exec supabase db dump --local --schema public --data-only=false | grep -E "create table|create type" | head -20
```

Expected: lines for `user_role`, `profiles`, `invitations`, `audit_log`, `auth_attempts`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat(db): add base tables for profiles, invitations, audit, rate-limit"
```

---

### Task 7: Migration 0002 — `auth.role_of()` helper + audit trigger

**Files:**
- Create: `supabase/migrations/0002_functions.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_functions.sql`:
```sql
-- 0002_functions.sql — Helper functions used by RLS and audit log writes.

-- SECURITY DEFINER lets RLS policies on other tables read profiles.role
-- without recursing through profiles' own policies. The function body is
-- a trivial SELECT, no logic, no SQL injection surface.
create or replace function auth.role_of(uid uuid) returns user_role
  language sql stable security definer
  set search_path = public
  as $$ select role from public.profiles where id = uid $$;

revoke all on function auth.role_of(uuid) from public;
grant execute on function auth.role_of(uuid) to authenticated, anon;

-- Helper: write an audit row from a server action via the service role.
-- Server actions call this with the actor uuid; it does not trust auth.uid().
create or replace function public.write_audit(
  p_actor uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb default '{}'::jsonb
) returns void
  language plpgsql security definer
  set search_path = public
  as $$
begin
  insert into audit_log (actor_id, action, target_type, target_id, metadata)
  values (p_actor, p_action, p_target_type, p_target_id, p_metadata);
end;
$$;

revoke all on function public.write_audit(uuid, text, text, text, jsonb) from public;
-- Only the service role uses this; do not grant to authenticated.
```

- [ ] **Step 2: Apply**

```bash
pnpm exec supabase db reset
```

Expected: clean reset, both migrations applied.

- [ ] **Step 3: Verify the function exists**

```bash
pnpm exec supabase db diff --local 2>&1 | head -5
```

Expected: nothing (migrations are in sync). Then verify by querying:
```bash
pnpm exec supabase db remote commit --help >/dev/null  # noop, just sanity check
```

(Functions live in `auth` schema; can also confirm via Supabase Studio at `http://127.0.0.1:54323`.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_functions.sql
git commit -m "feat(db): add auth.role_of helper and write_audit function"
```

---

### Task 8: Migration 0003 — RLS policies

**Files:**
- Create: `supabase/migrations/0003_rls.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_rls.sql`:
```sql
-- 0003_rls.sql — Row Level Security for tables used in Plan A.

-- profiles
alter table profiles enable row level security;

create policy "profiles: read own + admin reads all" on profiles for select
  using (
    id = auth.uid() or auth.role_of(auth.uid()) = 'admin'
  );

create policy "profiles: admin updates roles" on profiles for update
  using (auth.role_of(auth.uid()) = 'admin')
  with check (auth.role_of(auth.uid()) = 'admin');

create policy "profiles: self updates own profile (not role)" on profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles p where p.id = auth.uid())
  );

-- profile inserts happen via service-role from invite-accept handler; deny client inserts.
create policy "profiles: no client inserts" on profiles for insert with check (false);

-- invitations: admin only
alter table invitations enable row level security;

create policy "invitations: admin only" on invitations for all
  using (auth.role_of(auth.uid()) = 'admin')
  with check (auth.role_of(auth.uid()) = 'admin');

-- audit_log: admin reads, service-role writes
alter table audit_log enable row level security;

create policy "audit_log: admin reads" on audit_log for select
  using (auth.role_of(auth.uid()) = 'admin');

-- auth_attempts: service-role only (used by rate limit checks)
alter table auth_attempts enable row level security;
-- No policies = no client access. Service role bypasses RLS by design.
```

- [ ] **Step 2: Apply**

```bash
pnpm db:reset
```

Expected: reset clean, all three migrations applied.

- [ ] **Step 3: Sanity-check policies**

Open Supabase Studio (`http://127.0.0.1:54323`) → Authentication → Policies. Confirm 5 policies on `profiles`, 1 on `invitations`, 1 on `audit_log`. RLS enabled on all four tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_rls.sql
git commit -m "feat(db): enable RLS for profiles, invitations, audit_log, auth_attempts"
```

---

## Phase 2 — Supabase clients

### Task 9: Server client factory

**Files:**
- Create: `src/lib/supabase/server.ts`

- [ ] **Step 1: Write the factory**

Create `src/lib/supabase/server.ts`:
```ts
// Server-side Supabase client tied to the current request's cookies.
// Use in: Server Components, Server Actions, Route Handlers.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component which cannot set cookies. Safe to ignore.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors. (May error if env types aren't declared; that's fine — `process.env` returns `string | undefined`, and the `!` non-null assertion is acceptable here because failures will be loud at startup.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/server.ts
git commit -m "feat(supabase): add server client factory"
```

---

### Task 10: Browser client factory

**Files:**
- Create: `src/lib/supabase/client.ts`

- [ ] **Step 1: Write the factory**

Create `src/lib/supabase/client.ts`:
```ts
// Browser-side Supabase client. Used by the few Client Components that
// need realtime / auth callbacks. Most reads/writes go through Server
// Actions instead — do not call this from a normal client component
// just to fetch data.
'use client';
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm typecheck
git add src/lib/supabase/client.ts
git commit -m "feat(supabase): add browser client factory"
```

---

### Task 11: Admin client factory (server-only, service role)

**Files:**
- Create: `src/lib/supabase/admin.ts`

- [ ] **Step 1: Write the factory**

Create `src/lib/supabase/admin.ts`:
```ts
// Service-role Supabase client. BYPASSES Row Level Security.
// Use ONLY for narrowly-scoped operations that legitimately need it:
//   - creating auth users from validated invitation tokens
//   - writing audit_log rows
//   - rate-limit bookkeeping in auth_attempts
// Never import this file from a Client Component or non-server module.
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or URL missing — admin client cannot be created.');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 2: Install `server-only`** (Next.js helper that throws at build time if a server module is imported into a client bundle)

```bash
pnpm add server-only
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck
git add src/lib/supabase/admin.ts package.json pnpm-lock.yaml
git commit -m "feat(supabase): add admin client factory with server-only guard"
```

---

## Phase 3 — Auth helpers

### Task 12: Typed auth errors

**Files:**
- Create: `src/server/auth/errors.ts`

- [ ] **Step 1: Write the error classes**

Create `src/server/auth/errors.ts`:
```ts
// Typed auth errors thrown by Server Actions and route handlers.
// Caught at the boundary and converted to UI-safe responses.
export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(resource = 'Resource') {
    super(`${resource} not found.`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION';
  readonly issues: unknown;
  constructor(issues: unknown, message = 'Invalid input.') {
    super(message);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/auth/errors.ts
git commit -m "feat(server): typed auth errors"
```

---

### Task 13: `requireRole` helper — TDD

**Files:**
- Create: `src/server/auth/__tests__/require.test.ts`, `src/server/auth/require.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/auth/__tests__/require.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedError, ForbiddenError } from '../errors';

// We're testing the pure logic of requireRole given a profile loader.
// The Supabase calls are abstracted via the loader injected at construction.

import { makeRequireRole } from '../require';

describe('makeRequireRole', () => {
  it('throws UnauthorizedError when no user', async () => {
    const requireRole = makeRequireRole({
      loadSession: async () => null,
    });
    await expect(requireRole('admin')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ForbiddenError when user has wrong role', async () => {
    const requireRole = makeRequireRole({
      loadSession: async () => ({
        user: { id: 'u1' },
        profile: { id: 'u1', display_name: 'M', role: 'musician', created_at: '' },
      }),
    });
    await expect(requireRole('admin')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns session when role matches one of allowed', async () => {
    const session = {
      user: { id: 'u1' },
      profile: { id: 'u1', display_name: 'L', role: 'leader', created_at: '' },
    };
    const requireRole = makeRequireRole({ loadSession: async () => session });
    const out = await requireRole('admin', 'leader');
    expect(out).toEqual(session);
  });

  it('throws ForbiddenError when allowed list is empty', async () => {
    const requireRole = makeRequireRole({
      loadSession: async () => ({
        user: { id: 'u1' },
        profile: { id: 'u1', display_name: 'A', role: 'admin', created_at: '' },
      }),
    });
    // @ts-expect-error: testing runtime behavior with no roles
    await expect(requireRole()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run the test, watch it fail**

```bash
pnpm test -t makeRequireRole
```

Expected: FAIL with "Cannot find module '../require'".

- [ ] **Step 3: Implement `require.ts`**

Create `src/server/auth/require.ts`:
```ts
// Pure logic for role-gating, with the Supabase-bound session loader injected.
// The `requireRole` helper exported by default uses the real loader.
import 'server-only';
import { UnauthorizedError, ForbiddenError } from './errors';
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
  return async function requireRole(...allowed: UserRole[]): Promise<Session> {
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
```

- [ ] **Step 4: Run the test, watch it pass**

```bash
pnpm test -t makeRequireRole
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/require.ts src/server/auth/__tests__/require.test.ts
git commit -m "feat(server): role-gating helper with injected session loader"
```

---

## Phase 4 — Email infrastructure

### Task 14: Nodemailer transport — TDD

**Files:**
- Create: `src/lib/email/transport.ts`, `src/lib/email/__tests__/transport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/email/__tests__/transport.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMailer } from '../transport';

const sendMail = vi.fn();

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
  createTransport: () => ({ sendMail }),
}));

describe('makeMailer', () => {
  beforeEach(() => sendMail.mockReset());

  it('sends an email through the SMTP transport with from/to/subject/html/text', async () => {
    sendMail.mockResolvedValueOnce({ messageId: '<id1>' });
    const mailer = makeMailer({
      host: 'smtp.example.org', port: 587, secure: false,
      user: 'u', password: 'p', from: 'NLC <noreply@example.org>',
    });
    const result = await mailer.send({
      to: 'a@example.org',
      subject: 'Hello',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(sendMail).toHaveBeenCalledOnce();
    const arg = sendMail.mock.calls[0][0];
    expect(arg.from).toBe('NLC <noreply@example.org>');
    expect(arg.to).toBe('a@example.org');
    expect(arg.subject).toBe('Hello');
    expect(arg.html).toBe('<p>hi</p>');
    expect(arg.text).toBe('hi');
    expect(result.messageId).toBe('<id1>');
  });

  it('rethrows transport errors as Error', async () => {
    sendMail.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const mailer = makeMailer({
      host: 'smtp.example.org', port: 587, secure: false,
      user: 'u', password: 'p', from: 'NLC <x@y>',
    });
    await expect(
      mailer.send({ to: 'a@b', subject: 's', html: 'h', text: 't' }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
pnpm test -t makeMailer
```

Expected: FAIL — "Cannot find module '../transport'".

- [ ] **Step 3: Implement `transport.ts`**

Create `src/lib/email/transport.ts`:
```ts
import 'server-only';
import nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export interface SendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(input: SendInput): Promise<{ messageId: string }>;
}

export function makeMailer(cfg: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
  });

  return {
    async send({ to, subject, html, text }) {
      const info = await transport.sendMail({
        from: cfg.from,
        to,
        subject,
        html,
        text,
      });
      return { messageId: String(info.messageId ?? '') };
    },
  };
}

// Default mailer wired from env. Lazily constructed.
let cached: Mailer | null = null;
export function defaultMailer(): Mailer {
  if (cached) return cached;
  cached = makeMailer({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER!,
    password: process.env.SMTP_PASSWORD!,
    from: process.env.SMTP_FROM!,
  });
  return cached;
}
```

- [ ] **Step 4: Run, watch pass**

```bash
pnpm test -t makeMailer
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/transport.ts src/lib/email/__tests__/transport.test.ts
git commit -m "feat(email): SMTP transport via nodemailer with injectable config"
```

---

### Task 15: Invitation email template

**Files:**
- Create: `src/lib/email/templates/invitation.ts`

- [ ] **Step 1: Write the template module**

Create `src/lib/email/templates/invitation.ts`:
```ts
import 'server-only';

export interface InvitationEmailInput {
  acceptUrl: string;
  inviterName: string;
  role: 'admin' | 'leader' | 'musician';
  expiresAt: Date;
}

export function renderInvitationEmail(input: InvitationEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { acceptUrl, inviterName, role, expiresAt } = input;
  const expiry = expiresAt.toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });

  const subject = `You're invited to NLC Burgdorf SongDrop`;

  const text = [
    `Hello,`,
    ``,
    `${inviterName} invited you to NLC Burgdorf SongDrop as a ${role}.`,
    ``,
    `Open this link to accept the invitation and set up your account:`,
    `${acceptUrl}`,
    ``,
    `This link expires on ${expiry}. It can only be used once.`,
    ``,
    `If you weren't expecting this email, you can ignore it.`,
    ``,
    `— NLC Burgdorf SongDrop`,
  ].join('\n');

  const html = `
<!doctype html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a">
  <h2 style="margin:0 0 16px">You're invited to NLC Burgdorf SongDrop</h2>
  <p><strong>${escape(inviterName)}</strong> invited you as a <strong>${escape(role)}</strong>.</p>
  <p>
    <a href="${escape(acceptUrl)}" style="display:inline-block;background:#b45309;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Accept invitation</a>
  </p>
  <p style="color:#475569;font-size:14px">This link expires on ${escape(expiry)} and can only be used once.</p>
  <p style="color:#475569;font-size:14px">If you weren't expecting this email, you can ignore it.</p>
</body></html>
`.trim();

  return { subject, html, text };
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 2: Quick sanity test inline**

Create `src/lib/email/__tests__/invitation.template.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderInvitationEmail } from '../templates/invitation';

describe('renderInvitationEmail', () => {
  it('renders subject, html, and text with the accept URL escaped', () => {
    const out = renderInvitationEmail({
      acceptUrl: 'https://example.org/accept?token=<abc>&role=admin',
      inviterName: 'Lisa <Maria>',
      role: 'leader',
      expiresAt: new Date('2026-05-07T12:00:00Z'),
    });
    expect(out.subject).toMatch(/SongDrop/);
    expect(out.html).toContain('Lisa &lt;Maria&gt;');
    expect(out.html).toContain('token=&lt;abc&gt;&amp;role=admin');
    expect(out.text).toContain('https://example.org/accept?token=<abc>&role=admin'); // raw in text is fine
    expect(out.text).toContain('leader');
  });
});
```

- [ ] **Step 3: Run, watch pass**

```bash
pnpm test -t renderInvitationEmail
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/templates/invitation.ts src/lib/email/__tests__/invitation.template.test.ts
git commit -m "feat(email): invitation template with HTML + plaintext"
```

---

## Phase 5 — Invitation token utilities

### Task 16: Token generate/hash/compare — TDD

**Files:**
- Create: `src/lib/invitations/__tests__/token.test.ts`, `src/lib/invitations/token.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/invitations/__tests__/token.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateInvitationToken, hashToken, verifyToken } from '../token';

describe('invitation tokens', () => {
  it('generates 32 bytes encoded as 43-char base64url', async () => {
    const t = generateInvitationToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes are unique per generation', async () => {
    const a = await hashToken(generateInvitationToken());
    const b = await hashToken(generateInvitationToken());
    expect(a).not.toBe(b);
  });

  it('verifyToken returns true for matching token+hash', async () => {
    const raw = generateInvitationToken();
    const hash = await hashToken(raw);
    expect(await verifyToken(raw, hash)).toBe(true);
  });

  it('verifyToken returns false for wrong token', async () => {
    const raw = generateInvitationToken();
    const hash = await hashToken(raw);
    const other = generateInvitationToken();
    expect(await verifyToken(other, hash)).toBe(false);
  });

  it('verifyToken returns false for malformed hash', async () => {
    expect(await verifyToken('anything', 'not-a-bcrypt-hash')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
pnpm test -t "invitation tokens"
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `token.ts`**

Create `src/lib/invitations/token.ts`:
```ts
import 'server-only';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const TOKEN_BYTES = 32; // 32 bytes → 43 chars base64url

export function generateInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export async function hashToken(raw: string): Promise<string> {
  return bcrypt.hash(raw, 12);
}

export async function verifyToken(raw: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(raw, hash);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run, watch pass**

```bash
pnpm test -t "invitation tokens"
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invitations/token.ts src/lib/invitations/__tests__/token.test.ts
git commit -m "feat(invitations): token generate/hash/verify with bcrypt"
```

---

## Phase 6 — Invitation Server Actions

### Task 17: Zod schemas for invitations

**Files:**
- Create: `src/server/actions/invitations.schemas.ts`

- [ ] **Step 1: Write the schemas**

Create `src/server/actions/invitations.schemas.ts`:
```ts
import { z } from 'zod';

export const userRole = z.enum(['admin', 'leader', 'musician']);
export type UserRole = z.infer<typeof userRole>;

export const sendInvitationInput = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: userRole,
});
export type SendInvitationInput = z.infer<typeof sendInvitationInput>;

export const revokeInvitationInput = z.object({
  id: z.string().uuid(),
});
export type RevokeInvitationInput = z.infer<typeof revokeInvitationInput>;
```

- [ ] **Step 2: Commit** (schemas are too thin to test in isolation; they're tested as part of the action tests below)

```bash
git add src/server/actions/invitations.schemas.ts
git commit -m "feat(invitations): zod schemas for action inputs"
```

---

### Task 18: `sendInvitation` Server Action — TDD

**Files:**
- Create: `src/server/actions/invitations.ts`, `src/server/actions/__tests__/invitations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/actions/__tests__/invitations.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/server/auth/errors';

// We test the pure logic by using makeSendInvitation, which takes its
// dependencies (auth gate, db, mailer, token funcs) as arguments.

import { makeSendInvitation } from '../invitations';

const adminSession = {
  user: { id: 'admin-uid' },
  profile: { id: 'admin-uid', display_name: 'Admin', role: 'admin' as const, created_at: '' },
};
const musicianSession = {
  user: { id: 'm-uid' },
  profile: { id: 'm-uid', display_name: 'M', role: 'musician' as const, created_at: '' },
};

function makeFakes() {
  const insertedRows: any[] = [];
  const sentMails: any[] = [];

  const db = {
    insertInvitation: vi.fn(async (row: any) => {
      insertedRows.push(row);
      return { id: 'inv-1', ...row };
    }),
    writeAudit: vi.fn(async () => {}),
  };
  const mailer = { send: vi.fn(async (msg: any) => { sentMails.push(msg); return { messageId: '<id>' }; }) };
  const tokens = {
    generate: vi.fn(() => 'RAWTOKEN'),
    hash: vi.fn(async (raw: string) => `hash(${raw})`),
  };
  return { db, mailer, tokens, insertedRows, sentMails };
}

describe('sendInvitation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ForbiddenError if caller is not admin', async () => {
    const { db, mailer, tokens } = makeFakes();
    const action = makeSendInvitation({
      requireAdmin: async () => { throw new ForbiddenError(); },
      db, mailer, tokens, originUrl: 'https://x.test',
    });
    await expect(action({ email: 'x@y.org', role: 'musician' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError on invalid email', async () => {
    const { db, mailer, tokens } = makeFakes();
    const action = makeSendInvitation({
      requireAdmin: async () => adminSession,
      db, mailer, tokens, originUrl: 'https://x.test',
    });
    await expect(action({ email: 'not-an-email', role: 'musician' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts hashed token, sends email with raw token, writes audit', async () => {
    const { db, mailer, tokens, insertedRows, sentMails } = makeFakes();
    const action = makeSendInvitation({
      requireAdmin: async () => adminSession,
      db, mailer, tokens, originUrl: 'https://x.test',
    });
    await action({ email: 'New@Example.org', role: 'leader' });

    expect(tokens.generate).toHaveBeenCalled();
    expect(tokens.hash).toHaveBeenCalledWith('RAWTOKEN');

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].email).toBe('new@example.org'); // lowercased
    expect(insertedRows[0].role).toBe('leader');
    expect(insertedRows[0].invited_by).toBe('admin-uid');
    expect(insertedRows[0].token_hash).toBe('hash(RAWTOKEN)');
    expect(insertedRows[0].expires_at).toBeInstanceOf(Date);

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe('new@example.org');
    expect(sentMails[0].html).toContain('https://x.test/api/invitations/accept?token=RAWTOKEN');
    expect(sentMails[0].text).toContain('https://x.test/api/invitations/accept?token=RAWTOKEN');

    expect(db.writeAudit).toHaveBeenCalledWith({
      actorId: 'admin-uid',
      action: 'invite.send',
      targetType: 'invitation',
      targetId: 'inv-1',
      metadata: { email: 'new@example.org', role: 'leader' },
    });
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
pnpm test -t sendInvitation
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the action with injectable deps**

Create `src/server/actions/invitations.ts`:
```ts
'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { sendInvitationInput, revokeInvitationInput } from './invitations.schemas';
import { ValidationError, ForbiddenError } from '@/server/auth/errors';
import { requireRole, type Session } from '@/server/auth/require';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateInvitationToken, hashToken } from '@/lib/invitations/token';
import { defaultMailer } from '@/lib/email/transport';
import { renderInvitationEmail } from '@/lib/email/templates/invitation';

// --- Pure factory for tests ---
export interface InvitationDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    insertInvitation(row: {
      email: string; role: 'admin'|'leader'|'musician'; invited_by: string;
      token_hash: string; expires_at: Date;
    }): Promise<{ id: string } & Record<string, unknown>>;
    writeAudit(input: {
      actorId: string; action: string; targetType: string; targetId: string;
      metadata: Record<string, unknown>;
    }): Promise<void>;
  };
  mailer: { send(msg: { to: string; subject: string; html: string; text: string }): Promise<{ messageId: string }> };
  tokens: { generate(): string; hash(raw: string): Promise<string> };
  originUrl: string;
}

const TTL_MS = 72 * 60 * 60 * 1000;

export function makeSendInvitation(deps: InvitationDeps) {
  return async function sendInvitation(
    rawInput: z.input<typeof sendInvitationInput>,
  ): Promise<{ id: string }> {
    const session = await deps.requireAdmin();
    const parsed = sendInvitationInput.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const raw = deps.tokens.generate();
    const tokenHash = await deps.tokens.hash(raw);
    const expiresAt = new Date(Date.now() + TTL_MS);

    const inserted = await deps.db.insertInvitation({
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: session.profile.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    const acceptUrl = `${deps.originUrl}/api/invitations/accept?token=${raw}`;
    const email = renderInvitationEmail({
      acceptUrl,
      inviterName: session.profile.display_name,
      role: parsed.data.role,
      expiresAt,
    });
    await deps.mailer.send({ to: parsed.data.email, ...email });

    await deps.db.writeAudit({
      actorId: session.profile.id,
      action: 'invite.send',
      targetType: 'invitation',
      targetId: inserted.id,
      metadata: { email: parsed.data.email, role: parsed.data.role },
    });

    return { id: inserted.id };
  };
}

// --- Default wired action used by Next.js ---
export const sendInvitation = makeSendInvitation({
  requireAdmin: () => requireRole('admin'),
  db: {
    async insertInvitation(row) {
      const sb = createSupabaseAdminClient();
      const { data, error } = await sb
        .from('invitations')
        .insert(row)
        .select('id')
        .single();
      if (error || !data) throw new Error(`insertInvitation failed: ${error?.message}`);
      return data as { id: string };
    },
    async writeAudit({ actorId, action, targetType, targetId, metadata }) {
      const sb = createSupabaseAdminClient();
      const { error } = await sb.rpc('write_audit', {
        p_actor: actorId,
        p_action: action,
        p_target_type: targetType,
        p_target_id: targetId,
        p_metadata: metadata,
      });
      if (error) throw new Error(`writeAudit failed: ${error.message}`);
    },
  },
  mailer: defaultMailer(),
  tokens: { generate: generateInvitationToken, hash: hashToken },
  originUrl: process.env.APP_ORIGIN ?? 'http://localhost:3000',
});

// --- listPending + revoke actions (small, no separate factory needed for tests) ---
export async function listPendingInvitations() {
  await requireRole('admin');
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('invitations')
    .select('id, email, role, expires_at, accepted_at, created_at')
    .is('accepted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function revokeInvitation(rawInput: z.input<typeof revokeInvitationInput>) {
  const session = await requireRole('admin');
  const parsed = revokeInvitationInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('invitations')
    .delete()
    .eq('id', parsed.data.id)
    .is('accepted_at', null)
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  await sb.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'invite.revoke',
    p_target_type: 'invitation',
    p_target_id: parsed.data.id,
    p_metadata: {},
  });

  revalidatePath('/admin/invites');
  return data;
}
```

- [ ] **Step 4: Run, watch pass**

```bash
pnpm test -t sendInvitation
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/invitations.ts src/server/actions/__tests__/invitations.test.ts
git commit -m "feat(invitations): sendInvitation server action with audit + revoke"
```

---

### Task 19: Invitation accept route handler

**Files:**
- Create: `src/app/api/invitations/accept/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/invitations/accept/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyToken } from '@/lib/invitations/token';

const querySchema = z.object({
  token: z.string().min(20).max(200),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ token: url.searchParams.get('token') });
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/sign-in?invite=invalid', req.url));
  }
  const { token } = parsed.data;

  const sb = createSupabaseAdminClient();

  // Find candidate rows by *not* token directly — bcrypt is not searchable.
  // Instead, scope by unaccepted+unexpired and verify each candidate.
  const { data: candidates, error: listError } = await sb
    .from('invitations')
    .select('id, email, role, token_hash, expires_at, accepted_at, invited_by')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString());
  if (listError) {
    return NextResponse.redirect(new URL('/sign-in?invite=error', req.url));
  }

  let invitation: typeof candidates[number] | null = null;
  for (const row of candidates ?? []) {
    if (await verifyToken(token, row.token_hash)) {
      invitation = row;
      break;
    }
  }
  if (!invitation) {
    return NextResponse.redirect(new URL('/sign-in?invite=invalid', req.url));
  }

  // Check whether an auth user already exists for the email.
  const { data: existingUserList } = await sb.auth.admin.listUsers();
  const existing = existingUserList?.users.find(
    (u) => u.email?.toLowerCase() === invitation!.email.toLowerCase(),
  );

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error: createError } = await sb.auth.admin.createUser({
      email: invitation.email,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return NextResponse.redirect(new URL('/sign-in?invite=error', req.url));
    }
    userId = created.user.id;
  }

  // Upsert the profile with the invited role.
  const { error: profileError } = await sb
    .from('profiles')
    .upsert(
      { id: userId, display_name: invitation.email.split('@')[0]!, role: invitation.role },
      { onConflict: 'id' },
    );
  if (profileError) {
    return NextResponse.redirect(new URL('/sign-in?invite=error', req.url));
  }

  // Mark invitation accepted.
  await sb
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  // Generate a magic-link sign-in. The user is redirected to /onboard after
  // the magic link's callback completes. We use Supabase Auth's generateLink
  // because it handles cookie issuance via the auth/callback handler.
  const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: invitation.email,
    options: {
      redirectTo: `${process.env.APP_ORIGIN}/api/auth/callback?next=/onboard`,
    },
  });
  if (linkError || !linkData.properties?.action_link) {
    return NextResponse.redirect(new URL('/sign-in?invite=error', req.url));
  }

  return NextResponse.redirect(linkData.properties.action_link);
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/invitations/accept/route.ts
git commit -m "feat(invitations): accept route validates token and provisions user"
```

---

### Task 20: Auth callback route

**Files:**
- Create: `src/app/api/auth/callback/route.ts`

- [ ] **Step 1: Write the handler**

Create `src/app/api/auth/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/home';

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=no_code', req.url));
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=exchange', req.url));
  }
  return NextResponse.redirect(new URL(next, req.url));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/callback/route.ts
git commit -m "feat(auth): supabase magic-link code exchange route"
```

---

## Phase 7 — Profile actions

### Task 21: `updateMyProfile` and `adminSetUserRole` actions

**Files:**
- Create: `src/server/actions/profile.ts`, `src/server/actions/profile.schemas.ts`

- [ ] **Step 1: Write the schemas**

Create `src/server/actions/profile.schemas.ts`:
```ts
import { z } from 'zod';
import { userRole } from './invitations.schemas';

export const updateMyProfileInput = z.object({
  display_name: z.string().trim().min(1).max(80),
});
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileInput>;

export const adminSetUserRoleInput = z.object({
  user_id: z.string().uuid(),
  role: userRole,
});
export type AdminSetUserRoleInput = z.infer<typeof adminSetUserRoleInput>;
```

- [ ] **Step 2: Write the actions**

Create `src/server/actions/profile.ts`:
```ts
'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ValidationError } from '@/server/auth/errors';
import { requireRole } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { updateMyProfileInput, adminSetUserRoleInput } from './profile.schemas';

export async function updateMyProfile(rawInput: z.input<typeof updateMyProfileInput>) {
  const session = await requireRole('admin', 'leader', 'musician');
  const parsed = updateMyProfileInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();
  const { error } = await sb
    .from('profiles')
    .update({ display_name: parsed.data.display_name })
    .eq('id', session.profile.id);
  if (error) throw new Error(error.message);

  revalidatePath('/me');
  revalidatePath('/home');
  return { ok: true };
}

export async function adminSetUserRole(rawInput: z.input<typeof adminSetUserRoleInput>) {
  const session = await requireRole('admin');
  const parsed = adminSetUserRoleInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  if (parsed.data.user_id === session.profile.id && parsed.data.role !== 'admin') {
    throw new ValidationError({ form: ['Cannot demote yourself.'] });
  }

  const sb = createSupabaseAdminClient();
  const { error } = await sb
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.user_id);
  if (error) throw new Error(error.message);

  await sb.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'profile.role_change',
    p_target_type: 'profile',
    p_target_id: parsed.data.user_id,
    p_metadata: { new_role: parsed.data.role },
  });

  revalidatePath('/admin/users');
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/actions/profile.ts src/server/actions/profile.schemas.ts
git commit -m "feat(profile): updateMyProfile and adminSetUserRole actions"
```

---

## Phase 8 — UI shell

### Task 22: Tailwind v4 globals + theme variables (light + dark only for Plan A)

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Replace `globals.css`**

Replace the contents of `src/app/globals.css` with:
```css
@import "tailwindcss";

/* CSS variables drive theme tokens. Light is the default; .dark switches them. */
@layer base {
  :root {
    --color-bg:        oklch(99% 0 0);
    --color-fg:        oklch(15% 0.02 250);
    --color-muted:     oklch(96% 0.005 250);
    --color-muted-fg:  oklch(45% 0.02 250);
    --color-border:    oklch(90% 0.005 250);
    --color-accent:    oklch(60% 0.13 60);   /* warm amber */
    --color-accent-fg: oklch(99% 0 0);
    --color-danger:    oklch(55% 0.20 25);
  }

  .dark {
    --color-bg:        oklch(14% 0.02 250);
    --color-fg:        oklch(96% 0 0);
    --color-muted:     oklch(20% 0.02 250);
    --color-muted-fg:  oklch(70% 0.02 250);
    --color-border:    oklch(25% 0.02 250);
    --color-accent:    oklch(70% 0.14 60);
    --color-accent-fg: oklch(14% 0 0);
    --color-danger:    oklch(70% 0.20 25);
  }

  html, body {
    background: var(--color-bg);
    color: var(--color-fg);
  }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-feature-settings: "ss01", "cv11";
  }
}

@theme inline {
  --color-bg:        var(--color-bg);
  --color-fg:        var(--color-fg);
  --color-muted:     var(--color-muted);
  --color-muted-fg:  var(--color-muted-fg);
  --color-border:    var(--color-border);
  --color-accent:    var(--color-accent);
  --color-accent-fg: var(--color-accent-fg);
  --color-danger:    var(--color-danger);
}
```

- [ ] **Step 2: Replace `src/app/layout.tsx`**

Replace contents with:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NLC Burgdorf SongDrop',
  description: 'Worship songs, chords, and setlists for NLC Burgdorf.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: build succeeds. (You may see warnings about missing env vars at build time — fine for now if `.env.local` exists; if not, set placeholders in `.env.local` matching `.env.example`.)

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): tailwind v4 globals with light/dark theme variables"
```

---

### Task 23: Auth route group + sign-in page

**Files:**
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/sign-in/page.tsx`

- [ ] **Step 1: Auth layout**

Create `src/app/(auth)/layout.tsx`:
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-(--color-border) bg-(--color-muted) p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Sign-in page (magic link form)**

Create `src/app/(auth)/sign-in/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function signInAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) redirect('/sign-in?error=invalid_email');

  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.APP_ORIGIN}/api/auth/callback?next=/home` },
  });
  if (error) redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  redirect('/sign-in?sent=1');
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; invite?: string }>;
}) {
  const { sent, error, invite } = await searchParams;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-(--color-muted-fg)">
        We'll email you a magic link.
      </p>

      {invite === 'invalid' && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          That invitation link is invalid or has expired.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          {error}
        </p>
      )}
      {sent && (
        <p className="mb-4 rounded-md border border-(--color-accent)/30 bg-(--color-accent)/10 p-3 text-sm">
          Check your inbox for the sign-in link.
        </p>
      )}

      <form action={signInAction} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-(--color-accent) px-3 py-2 font-medium text-(--color-accent-fg)"
        >
          Send magic link
        </button>
      </form>
    </>
  );
}
```

- [ ] **Step 3: Verify route exists**

```bash
pnpm dev
```

Open `http://localhost:3000/sign-in`. Should render the form. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(auth)/'
git commit -m "feat(auth): sign-in page with magic-link form"
```

---

### Task 24: Onboard page (set display name + password)

**Files:**
- Create: `src/app/(auth)/onboard/page.tsx`

- [ ] **Step 1: Write the page + action**

Create `src/app/(auth)/onboard/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadSession } from '@/server/auth/require';

const PASSWORD_RE = /^(?=.*[^A-Za-z0-9]).{12,}$/;

async function completeOnboarding(formData: FormData) {
  'use server';
  const displayName = String(formData.get('display_name') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (displayName.length < 1 || displayName.length > 80) {
    redirect('/onboard?error=name');
  }
  if (!PASSWORD_RE.test(password)) {
    redirect('/onboard?error=password');
  }

  const session = await loadSession();
  if (!session) redirect('/sign-in?error=session');

  const sb = await createSupabaseServerClient();
  const { error: passError } = await sb.auth.updateUser({ password });
  if (passError) redirect(`/onboard?error=${encodeURIComponent(passError.message)}`);

  const { error: nameError } = await sb
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', session.user.id);
  if (nameError) redirect(`/onboard?error=${encodeURIComponent(nameError.message)}`);

  redirect('/home');
}

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await loadSession();
  if (!session) redirect('/sign-in');
  const { error } = await searchParams;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Welcome — set up your profile</h1>
      <p className="mb-6 text-sm text-(--color-muted-fg)">
        Choose a display name and a password.
      </p>
      {error && (
        <p className="mb-4 rounded-md border border-(--color-danger)/30 bg-(--color-danger)/10 p-3 text-sm">
          {error === 'name'
            ? 'Display name must be 1–80 characters.'
            : error === 'password'
              ? 'Password must be at least 12 characters and include a non-alphanumeric character.'
              : error}
        </p>
      )}
      <form action={completeOnboarding} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>Display name</span>
          <input
            type="text" name="display_name" required maxLength={80}
            defaultValue={session.profile.display_name}
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Password</span>
          <input
            type="password" name="password" required minLength={12}
            autoComplete="new-password"
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2"
          />
          <span className="text-xs text-(--color-muted-fg)">
            12+ chars, at least one non-alphanumeric.
          </span>
        </label>
        <button type="submit" className="rounded-md bg-(--color-accent) px-3 py-2 font-medium text-(--color-accent-fg)">
          Save and continue
        </button>
      </form>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add 'src/app/(auth)/onboard/'
git commit -m "feat(auth): onboard page to set display name and password"
```

---

### Task 25: App-shell layout (auth-gated)

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/TopBar.tsx`, `src/components/layout/BottomNav.tsx`, `src/components/layout/SideRail.tsx`

- [ ] **Step 1: Write the gated layout**

Create `src/app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { loadSession } from '@/server/auth/require';
import { AppShell } from '@/components/layout/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await loadSession();
  if (!session) redirect('/sign-in');
  return <AppShell session={session}>{children}</AppShell>;
}
```

- [ ] **Step 2: AppShell component**

Create `src/components/layout/AppShell.tsx`:
```tsx
import type { Session } from '@/server/auth/require';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { SideRail } from './SideRail';

export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-[240px_1fr]">
      <SideRail session={session} />
      <div className="flex min-h-dvh flex-col">
        <TopBar session={session} />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
        <BottomNav session={session} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: TopBar**

Create `src/components/layout/TopBar.tsx`:
```tsx
import Link from 'next/link';
import type { Session } from '@/server/auth/require';

export function TopBar({ session }: { session: Session }) {
  return (
    <header className="flex items-center justify-between border-b border-(--color-border) px-4 py-3 md:px-8">
      <Link href="/home" className="font-semibold tracking-tight">
        SongDrop
      </Link>
      <Link href="/me" className="text-sm text-(--color-muted-fg) hover:text-(--color-fg)">
        {session.profile.display_name}
      </Link>
    </header>
  );
}
```

- [ ] **Step 4: BottomNav**

Create `src/components/layout/BottomNav.tsx`:
```tsx
import Link from 'next/link';
import { Home, Music, ListMusic, ShieldCheck, User } from 'lucide-react';
import type { Session } from '@/server/auth/require';

export function BottomNav({ session }: { session: Session }) {
  const items: Array<{ href: string; label: string; icon: React.ElementType }> = [
    { href: '/home', label: 'Home', icon: Home },
    { href: '/songs', label: 'Songs', icon: Music },
    { href: '/playlists', label: 'Playlists', icon: ListMusic },
    ...(session.profile.role === 'admin'
      ? [{ href: '/admin/users', label: 'Admin', icon: ShieldCheck }]
      : []),
    { href: '/me', label: 'Me', icon: User },
  ];

  return (
    <nav className="border-t border-(--color-border) md:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex flex-col items-center gap-1 px-2 py-2 text-xs text-(--color-muted-fg) hover:text-(--color-fg)"
            >
              <Icon className="size-5" aria-hidden />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: SideRail**

Create `src/components/layout/SideRail.tsx`:
```tsx
import Link from 'next/link';
import { Home, Music, ListMusic, ShieldCheck, User } from 'lucide-react';
import type { Session } from '@/server/auth/require';

export function SideRail({ session }: { session: Session }) {
  const items: Array<{ href: string; label: string; icon: React.ElementType }> = [
    { href: '/home', label: 'Home', icon: Home },
    { href: '/songs', label: 'Songs', icon: Music },
    { href: '/playlists', label: 'Playlists', icon: ListMusic },
    ...(session.profile.role === 'admin'
      ? [{ href: '/admin/users', label: 'Admin', icon: ShieldCheck }]
      : []),
    { href: '/me', label: 'Me', icon: User },
  ];

  return (
    <aside className="hidden border-r border-(--color-border) px-3 py-6 md:block">
      <div className="px-3 pb-6 font-semibold tracking-tight">SongDrop</div>
      <ul className="grid gap-1">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-(--color-muted-fg) hover:bg-(--color-muted) hover:text-(--color-fg)"
            >
              <Icon className="size-4" aria-hidden />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(app)/layout.tsx' src/components/layout/
git commit -m "feat(ui): app-shell layout with top bar, side rail, bottom nav"
```

---

### Task 26: Role-aware home + me pages

**Files:**
- Create: `src/app/(app)/home/page.tsx`, `src/app/(app)/me/page.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Root page redirect**

Replace `src/app/page.tsx` with:
```tsx
import { redirect } from 'next/navigation';
import { loadSession } from '@/server/auth/require';

export default async function RootPage() {
  const session = await loadSession();
  redirect(session ? '/home' : '/sign-in');
}
```

- [ ] **Step 2: Home page**

Create `src/app/(app)/home/page.tsx`:
```tsx
import { loadSession } from '@/server/auth/require';

export default async function HomePage() {
  const session = await loadSession();
  if (!session) return null; // layout already redirected; defensive

  const role = session.profile.role;
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Welcome, {session.profile.display_name}.</h1>
      <p className="text-(--color-muted-fg)">
        You're signed in as a <span className="font-medium">{role}</span>.
      </p>

      <section className="grid gap-2 rounded-2xl border border-(--color-border) p-4">
        <h2 className="text-lg font-medium">What you can do</h2>
        <ul className="list-inside list-disc text-(--color-muted-fg)">
          {role === 'admin' && <li>Manage users and invitations.</li>}
          {(role === 'admin' || role === 'leader') && (
            <li>Create and share playlists with the band <span className="text-xs">(coming in Plan C)</span>.</li>
          )}
          <li>Browse and view songs <span className="text-xs">(coming in Plan B)</span>.</li>
          <li>Update your display name on the <a href="/me" className="underline">Me</a> page.</li>
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Me page (display name editing)**

Create `src/app/(app)/me/page.tsx`:
```tsx
import { loadSession } from '@/server/auth/require';
import { updateMyProfile } from '@/server/actions/profile';

async function action(formData: FormData) {
  'use server';
  await updateMyProfile({ display_name: String(formData.get('display_name') ?? '') });
}

export default async function MePage() {
  const session = await loadSession();
  if (!session) return null;

  return (
    <div className="grid max-w-md gap-4">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <form action={action} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>Display name</span>
          <input
            type="text" name="display_name" required maxLength={80}
            defaultValue={session.profile.display_name}
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2"
          />
        </label>
        <button type="submit" className="justify-self-start rounded-md bg-(--color-accent) px-3 py-2 font-medium text-(--color-accent-fg)">
          Save
        </button>
      </form>
      <p className="text-sm text-(--color-muted-fg)">
        Role: <span className="font-medium">{session.profile.role}</span>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add 'src/app/page.tsx' 'src/app/(app)/home' 'src/app/(app)/me'
git commit -m "feat(ui): role-aware home page and me/edit-display-name page"
```

---

### Task 27: Admin layout + users page

**Files:**
- Create: `src/app/(app)/admin/layout.tsx`, `src/app/(app)/admin/users/page.tsx`

- [ ] **Step 1: Admin layout (admin-gated)**

Create `src/app/(app)/admin/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { loadSession } from '@/server/auth/require';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await loadSession();
  if (!session) redirect('/sign-in');
  if (session.profile.role !== 'admin') redirect('/home');
  return <div className="grid gap-6">{children}</div>;
}
```

- [ ] **Step 2: Users page**

Create `src/app/(app)/admin/users/page.tsx`:
```tsx
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { loadSession } from '@/server/auth/require';
import { adminSetUserRole } from '@/server/actions/profile';

async function changeRoleAction(formData: FormData) {
  'use server';
  const user_id = String(formData.get('user_id') ?? '');
  const role = String(formData.get('role') ?? '') as 'admin'|'leader'|'musician';
  await adminSetUserRole({ user_id, role });
}

export default async function AdminUsersPage() {
  const session = await loadSession();
  if (!session) return null;

  // Use admin client to bypass RLS for the listing.
  const sb = createSupabaseAdminClient();
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, display_name, role, created_at')
    .order('created_at', { ascending: false });

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <div className="overflow-auto rounded-2xl border border-(--color-border)">
        <table className="w-full text-sm">
          <thead className="bg-(--color-muted)">
            <tr className="text-left">
              <th className="px-4 py-2">Display name</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Change role</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.id} className="border-t border-(--color-border)">
                <td className="px-4 py-2">{p.display_name}</td>
                <td className="px-4 py-2">{p.role}</td>
                <td className="px-4 py-2 text-(--color-muted-fg)">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2">
                  <form action={changeRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="user_id" value={p.id} />
                    <select
                      name="role"
                      defaultValue={p.role}
                      className="rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-1"
                      disabled={p.id === session.profile.id}
                    >
                      <option value="admin">admin</option>
                      <option value="leader">leader</option>
                      <option value="musician">musician</option>
                    </select>
                    <button
                      type="submit"
                      disabled={p.id === session.profile.id}
                      className="rounded-md bg-(--color-accent) px-2 py-1 text-xs font-medium text-(--color-accent-fg) disabled:opacity-40"
                    >
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(app)/admin/'
git commit -m "feat(admin): users page with role change form"
```

---

### Task 28: Admin invites page

**Files:**
- Create: `src/app/(app)/admin/invites/page.tsx`

- [ ] **Step 1: Page with send + revoke + list**

Create `src/app/(app)/admin/invites/page.tsx`:
```tsx
import { listPendingInvitations, sendInvitation, revokeInvitation } from '@/server/actions/invitations';

async function sendAction(formData: FormData) {
  'use server';
  await sendInvitation({
    email: String(formData.get('email') ?? ''),
    role: String(formData.get('role') ?? '') as 'admin'|'leader'|'musician',
  });
}

async function revokeAction(formData: FormData) {
  'use server';
  await revokeInvitation({ id: String(formData.get('id') ?? '') });
}

export default async function AdminInvitesPage() {
  const pending = await listPendingInvitations();

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h1 className="text-2xl font-semibold">Send invitation</h1>
        <form action={sendAction} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span>Email</span>
            <input
              type="email" name="email" required
              className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Role</span>
            <select
              name="role" required defaultValue="musician"
              className="rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2"
            >
              <option value="admin">admin</option>
              <option value="leader">leader</option>
              <option value="musician">musician</option>
            </select>
          </label>
          <button type="submit" className="rounded-md bg-(--color-accent) px-3 py-2 font-medium text-(--color-accent-fg)">
            Send invitation
          </button>
        </form>
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-medium">Pending invitations</h2>
        {pending.length === 0 ? (
          <p className="text-(--color-muted-fg)">None pending.</p>
        ) : (
          <div className="overflow-auto rounded-2xl border border-(--color-border)">
            <table className="w-full text-sm">
              <thead className="bg-(--color-muted)">
                <tr className="text-left">
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-t border-(--color-border)">
                    <td className="px-4 py-2">{p.email}</td>
                    <td className="px-4 py-2">{p.role}</td>
                    <td className="px-4 py-2 text-(--color-muted-fg)">
                      {new Date(p.expires_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <form action={revokeAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-(--color-danger)/40 px-2 py-1 text-xs text-(--color-danger)"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add 'src/app/(app)/admin/invites'
git commit -m "feat(admin): invites page with send and revoke"
```

---

## Phase 9 — Middleware

### Task 29: Session refresh + security headers + Origin check

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write the middleware**

Create `src/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  // 1) Origin/Host equality check on mutating methods (CSRF defense-in-depth).
  const method = req.method.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (origin) {
      try {
        const o = new URL(origin);
        if (o.host !== host) {
          return new NextResponse('Forbidden', { status: 403 });
        }
      } catch {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }
  }

  // 2) Refresh Supabase session cookies.
  const res = NextResponse.next({ request: req });
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  await sb.auth.getUser();

  // 3) Security headers.
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data:",
      `connect-src 'self' ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin}`,
      "frame-ancestors 'none'",
    ].join('; '),
  );
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.headers.set('Referrer-Policy', 'same-origin');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(security): middleware for session refresh, CSRF origin check, headers"
```

---

## Phase 10 — Seed (Plan A: just the first admin)

### Task 30: Seed script

**Files:**
- Create: `scripts/seed.ts`

- [ ] **Step 1: Write the seed**

Create `scripts/seed.ts`:
```ts
// Seeds the local dev DB with one admin user.
// Plan B/C will extend this with songs and playlists.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@nlc-burgdorf.local';
  const adminName = process.env.SEED_ADMIN_DISPLAY_NAME ?? 'Admin';
  const password = process.env.SEED_PASSWORD;

  if (!url || !serviceKey) throw new Error('Supabase env missing');
  if (!password || password.length < 12) {
    throw new Error('SEED_PASSWORD must be set and at least 12 chars (dev only).');
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await sb.auth.admin.listUsers();
  const found = existing.users.find((u) => u.email?.toLowerCase() === adminEmail.toLowerCase());
  let userId = found?.id;

  if (!userId) {
    const { data: created, error } = await sb.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    if (error || !created.user) throw error ?? new Error('createUser failed');
    userId = created.user.id;
    console.log(`Created admin auth user: ${adminEmail}`);
  } else {
    console.log(`Admin auth user already exists: ${adminEmail}`);
  }

  const { error: profileError } = await sb
    .from('profiles')
    .upsert({ id: userId, display_name: adminName, role: 'admin' }, { onConflict: 'id' });
  if (profileError) throw profileError;
  console.log('Profile upserted.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Install dotenv for the script**

```bash
pnpm add -D dotenv
```

- [ ] **Step 3: Run the seed**

```bash
pnpm db:seed
```

Expected:
```
Created admin auth user: admin@nlc-burgdorf.local
Profile upserted.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.ts package.json pnpm-lock.yaml
git commit -m "feat(seed): seed first admin user via supabase admin api"
```

---

## Phase 11 — RLS integration tests

### Task 31: RLS test helpers

**Files:**
- Create: `tests/rls/helpers.ts`

- [ ] **Step 1: Write the helper**

Create `tests/rls/helpers.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function admin(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Create a new auth user with a given role and return a per-user supabase client (acts as that user). */
export async function makeUser(role: 'admin'|'leader'|'musician'): Promise<{ id: string; sb: SupabaseClient }> {
  const a = admin();
  const email = `rls-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = 'rls-test-password-12+chars!';
  const { data, error } = await a.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  await a.from('profiles').upsert({ id: data.user.id, display_name: role, role });

  const sb = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { id: data.user.id, sb };
}

export async function cleanup(userIds: string[]) {
  const a = admin();
  for (const id of userIds) {
    await a.auth.admin.deleteUser(id);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/rls/helpers.ts
git commit -m "test(rls): helpers for creating role-bound supabase clients"
```

---

### Task 32: RLS test matrix for `profiles` and `invitations`

**Files:**
- Create: `tests/rls/profiles.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/rls/profiles.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeUser, cleanup } from './helpers';

let admin: Awaited<ReturnType<typeof makeUser>>;
let leader: Awaited<ReturnType<typeof makeUser>>;
let musician: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  admin = await makeUser('admin');
  leader = await makeUser('leader');
  musician = await makeUser('musician');
});

afterAll(async () => {
  await cleanup([admin.id, leader.id, musician.id]);
});

describe('profiles RLS', () => {
  it('musician can read own profile', async () => {
    const { data } = await musician.sb.from('profiles').select('id').eq('id', musician.id).single();
    expect(data?.id).toBe(musician.id);
  });

  it('musician cannot read other profiles', async () => {
    const { data } = await musician.sb.from('profiles').select('id').eq('id', leader.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('admin can read all profiles', async () => {
    const { data } = await admin.sb.from('profiles').select('id');
    const ids = (data ?? []).map((p) => p.id);
    expect(ids).toContain(admin.id);
    expect(ids).toContain(leader.id);
    expect(ids).toContain(musician.id);
  });

  it('musician cannot self-promote to admin', async () => {
    const { error } = await musician.sb.from('profiles')
      .update({ role: 'admin' })
      .eq('id', musician.id);
    expect(error).not.toBeNull(); // RLS update with-check denies the new role.
  });

  it('admin can change another user role', async () => {
    const { error } = await admin.sb.from('profiles')
      .update({ role: 'leader' })
      .eq('id', musician.id);
    expect(error).toBeNull();
    const { data } = await admin.sb.from('profiles').select('role').eq('id', musician.id).single();
    expect(data?.role).toBe('leader');
    // Restore for other tests
    await admin.sb.from('profiles').update({ role: 'musician' }).eq('id', musician.id);
  });

  it('leader cannot read invitations', async () => {
    const { data, error } = await leader.sb.from('invitations').select('id');
    expect(data ?? []).toHaveLength(0);
    // RLS with no matching policy returns empty rather than error in select.
    expect(error).toBeNull();
  });

  it('admin can read invitations', async () => {
    const { error } = await admin.sb.from('invitations').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('leader cannot insert invitations', async () => {
    const { error } = await leader.sb.from('invitations').insert({
      email: 'x@x.test', role: 'musician', invited_by: leader.id,
      token_hash: 'h', expires_at: new Date(Date.now() + 1e6).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it('musician cannot read audit_log', async () => {
    const { data, error } = await musician.sb.from('audit_log').select('id');
    expect(data ?? []).toHaveLength(0);
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run RLS tests**

Make sure Supabase is running:
```bash
pnpm db:start
```

Then run the tests with the env file:
```bash
pnpm test:rls --env-file .env.local
```

(If Vitest doesn't accept `--env-file`, set the env vars in your shell first or use a small loader. Add to `vitest.rls.config.ts` instead — see fallback in step 3.)

Expected: 9 tests pass.

- [ ] **Step 3: Fallback — load env in vitest.rls.config.ts if needed**

If the previous step failed because env vars aren't loaded, modify `vitest.rls.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { config } from 'dotenv';
config({ path: '.env.local' });

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/rls/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

Then re-run `pnpm test:rls`.

- [ ] **Step 4: Commit**

```bash
git add tests/rls/profiles.test.ts vitest.rls.config.ts
git commit -m "test(rls): profile + invitation policy matrix"
```

---

## Phase 12 — E2E happy-path

### Task 33: Playwright config

**Files:**
- Create: `e2e/playwright.config.ts`

- [ ] **Step 1: Write config**

Create `e2e/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.APP_ORIGIN ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add e2e/playwright.config.ts
git commit -m "test(e2e): playwright base configuration"
```

---

### Task 34: Auth-flow E2E — admin sign-in + invite happy path

**Files:**
- Create: `e2e/auth-flow.spec.ts`

- [ ] **Step 1: Write the spec**

Create `e2e/auth-flow.spec.ts`:
```ts
// E2E for Plan A:
//   1) Unauthenticated visit redirects to /sign-in.
//   2) Sign-in page renders the magic-link form.
//   3) After password-based sign-in (via Supabase REST), admin can land on
//      /home, /admin/users, /admin/invites; can send + revoke an invite.
//
// Magic-link click-through is deferred to Plan B (with Inbucket interception),
// because here we verify the gated routes & invite flow without round-tripping
// an email.
import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@nlc-burgdorf.local';
const ADMIN_PASSWORD = process.env.SEED_PASSWORD ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

test.skip(
  !ADMIN_PASSWORD || !SUPABASE_URL || !SUPABASE_ANON,
  'Required env (SEED_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY) not set.',
);

async function adminAuthCookies(request: APIRequestContext): Promise<{
  access_token: string;
  refresh_token: string;
}> {
  const res = await request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    },
  );
  if (!res.ok()) throw new Error(`signin failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { access_token: body.access_token, refresh_token: body.refresh_token };
}

test('unauthenticated visit redirects to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

test('admin can sign in, see admin pages, and send + revoke an invitation', async ({
  page,
  context,
  request,
}) => {
  const { access_token, refresh_token } = await adminAuthCookies(request);
  // Set the session cookies the @supabase/ssr server client expects.
  // The cookie name follows the Supabase SSR convention: `sb-<project-ref>-auth-token`.
  // We use the more robust approach: set both `sb-access-token` and `sb-refresh-token`,
  // which the SSR client's compatibility layer reads.
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0] ?? 'project';
  const cookieValue = JSON.stringify({ access_token, refresh_token });
  const baseURL = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  const host = new URL(baseURL).hostname;
  await context.addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: encodeURIComponent(cookieValue),
      domain: host,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  await page.goto('/home');
  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();

  await page.goto('/admin/invites');
  const testEmail = `e2e-${Date.now()}@example.test`;
  await page.getByLabel('Email').fill(testEmail);
  await page.getByLabel('Role').selectOption('musician');
  await page.getByRole('button', { name: /send invitation/i }).click();
  await expect(page.getByText(testEmail)).toBeVisible();

  await page.getByRole('button', { name: /revoke/i }).first().click();
  await expect(page.getByText(testEmail)).not.toBeVisible();
});
```

> **Note on cookie shape.** The exact Supabase SSR cookie name and serialization format have changed between minor releases. If the cookie path above doesn't authenticate the page, run the working app once, inspect DevTools → Application → Cookies under the dev origin, copy the actual cookie name (`sb-<ref>-auth-token`), and update the test. This is the only manual fixup that may be needed for this E2E across Supabase versions.

- [ ] **Step 2: Run** (skip if SMTP/seed env not set; intended to run in CI with full env)

Locally:
```bash
pnpm db:start
pnpm db:seed
pnpm test:e2e
```

Expected: 1 test passes (the sign-in + invite + revoke loop). If `SEED_PASSWORD` isn't set, the test auto-skips.

- [ ] **Step 3: Commit**

```bash
git add e2e/auth-flow.spec.ts
git commit -m "test(e2e): admin sign-in + invite + revoke happy path"
```

---

## Phase 13 — CI

### Task 35: GitHub Actions — unit, RLS-integration, scan-bundle

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/scan-bundle.yml`, `scripts/check-bundle.ts`

- [ ] **Step 1: Bundle scan script**

Create `scripts/check-bundle.ts`:
```ts
// Fails CI if 'service_role' appears in any client-bundle JS file.
// We never want SUPABASE_SERVICE_ROLE_KEY to leak to the browser.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '.next/static';
const NEEDLES = ['service_role', 'SUPABASE_SERVICE_ROLE_KEY'];

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e);
    const s = statSync(full);
    if (s.isDirectory()) yield* walk(full);
    else if (full.endsWith('.js') || full.endsWith('.mjs')) yield full;
  }
}

let bad = 0;
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8');
  for (const needle of NEEDLES) {
    if (text.includes(needle)) {
      console.error(`SECURITY: '${needle}' found in client bundle: ${file}`);
      bad += 1;
    }
  }
}
if (bad > 0) {
  console.error(`Bundle scan failed: ${bad} hit(s).`);
  process.exit(1);
} else {
  console.log('Bundle scan clean.');
}
```

- [ ] **Step 2: Verify locally**

```bash
pnpm build
pnpm scan-bundle
```

Expected: `Bundle scan clean.`

- [ ] **Step 3: CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push: { branches: [main] }
  pull_request:

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test

  rls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: pnpm install --frozen-lockfile
      - name: Start Supabase
        run: supabase start
      - name: Capture env
        run: |
          supabase status -o env >> $GITHUB_ENV
          echo "NEXT_PUBLIC_SUPABASE_URL=$API_URL" >> $GITHUB_ENV
          echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY" >> $GITHUB_ENV
          echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY" >> $GITHUB_ENV
      - run: pnpm test:rls
      - if: always()
        run: supabase stop

  scan-bundle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Build with placeholder env
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://placeholder.test
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder
          SUPABASE_SERVICE_ROLE_KEY: placeholder-service-role-key
          APP_ORIGIN: http://placeholder.test
          SMTP_HOST: smtp.placeholder.test
          SMTP_PORT: '587'
          SMTP_SECURE: 'false'
          SMTP_USER: placeholder
          SMTP_PASSWORD: placeholder
          SMTP_FROM: placeholder
        run: pnpm build
      - run: pnpm scan-bundle
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml scripts/check-bundle.ts
git commit -m "ci: unit, RLS integration, and bundle leak scan workflows"
```

---

## Phase 14 — README

### Task 36: README with setup instructions

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Create `README.md`:
````markdown
# NLC Burgdorf SongDrop

Worship songs, chords, and setlists for NLC Burgdorf.

**Status:** Plan A — Foundation. Auth + invitations + admin.

## Stack

- Next.js 15 (App Router) with React Server Components
- TypeScript (strict, `noUncheckedIndexedAccess`)
- Tailwind v4 (light/dark themes)
- Supabase (Postgres, Auth, Row-Level Security)
- `@supabase/ssr` for Next.js cookie-bound auth
- `nodemailer` for SMTP (church mail server)
- Vitest + fast-check (unit) · Playwright (E2E)

## Prerequisites

- Node 20+
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
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with setup, scripts, and security notes"
```

---

## Phase 15 — Final verification

### Task 37: End-to-end smoke

- [ ] **Step 1: Reset and rerun the full quality bar**

```bash
pnpm db:reset
pnpm db:seed
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rls
pnpm build
pnpm scan-bundle
```

Expected: every command exits 0. Vitest reports all unit tests passing; RLS tests all green; bundle scan clean.

- [ ] **Step 2: Manual demo**

```bash
pnpm dev
```

Walk through:
1. Visit `http://localhost:3000` → redirects to `/sign-in`.
2. Use Supabase Studio (`http://127.0.0.1:54323`) → Authentication → Users → "Send magic link" or use the password seeded by step 1's seed script — click the link from Inbucket (`http://127.0.0.1:54324`).
3. After magic-link callback, you land on `/home` as admin. Top bar shows your display name.
4. Navigate to `/admin/users`. List shows you. Cannot change your own role (form disabled).
5. Navigate to `/admin/invites`. Send an invitation to a fake email. Pending list updates.
6. Click "Revoke". Pending list updates again.
7. Open the email in Inbucket (Supabase's local mail catcher) for the invite — confirm the link contains a token query param.
8. Sign out via the Supabase Studio (or by deleting the cookie). `/home` redirects to `/sign-in`.

- [ ] **Step 3: Commit any final fixes**

If anything failed, fix it, commit, and re-run step 1.

---

## Self-review checklist (run before declaring Plan A complete)

Tick each:

- [ ] Spec coverage:
  - Auth + roles → Tasks 12–13 (`requireRole`), 23–24 (sign-in / onboard), 27 (admin gate), Migrations 0001/0002/0003.
  - Invitation flow → Tasks 14–20 (email, token, action, route handler).
  - Profile updates + role change → Task 21.
  - RLS integration tests → Tasks 31–32.
  - Mail via SMTP → Tasks 14–15 + env vars.
  - Audit log → invocations from `sendInvitation`, `revokeInvitation`, `adminSetUserRole`.
  - Security headers + Origin check → Task 29.
  - Service-role bundle scan → Task 35.
  - Dev seed (one admin) → Task 30.

- [ ] No placeholders: every step has actual file content / commands.
- [ ] Type consistency: `Session`, `Profile`, `UserRole` are defined once (in `src/server/auth/require.ts`) and reused.
- [ ] Each TDD task has 5 sub-steps (write test, run-fail, implement, run-pass, commit).
- [ ] Commit boundaries make sense — never leaving the repo broken between commits.

If anything fails: fix inline, re-run the smoke, then sign off Plan A.

---

## Out of scope — handed to Plan B

Plan B picks up immediately after this plan ships and adds:
- Songs table, indexes, RLS.
- ChordPro engine (parse, transpose, render) with property tests.
- Song viewer (transpose UI, font size, themes including stage-dark, autoscroll, fullscreen).
- Song editor (split source/preview).
- Multilingual (DE/EN/TA) including Noto Sans Tamil font setup and screenshot E2E.
- Song seed data (the 6 hymns).
