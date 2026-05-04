# NLC Burgdorf SongDrop — Design Spec

**Date:** 2026-05-04
**Status:** Draft, awaiting user approval
**Author:** Brainstorming session, claude-opus-4-7
**Project codename:** `songdrop`

---

## 1. Goal

Build a responsive web platform for NLC Burgdorf where worship songs (lyrics + chords) can be managed, shared, transposed, and organized into setlists. Used by admins, worship leaders, and musicians on phones, tablets, and laptops — including during live worship.

## 2. Decisions locked in during brainstorming

| Question | Decision |
|---|---|
| Stack & host | Next.js 15 (App Router) + Supabase (Postgres, Auth, RLS, Storage). Hosted on Vercel. |
| Account model | Invite-only by admin. No public signup. Magic-link first sign-in. |
| MVP scope | Full v1: auth + roles, song CRUD, viewer with dark mode + font + autoscroll + fullscreen, transposition engine with TDD, playlist builder + per-song transpose + notes, login-required sharing, seed data with German/English/Tamil. |
| Chord storage format | ChordPro inline (`[G]Amazing [C]grace`). Single source of truth. Renderer aligns chord-above-lyric at display time. |
| Sharing model | Login-required band-only. No public tokenized links in v1. |
| Architecture | RSC-first (reads via Server Components; mutations via Server Actions). RLS as second wall of defense. |
| Email | Custom SMTP via the church's mail server (`nodemailer`). Supabase Auth's built-in emails point at the same SMTP server. |
| Export | None in v1. No PDF, no ChordPro download. |
| Audit log | Includes admin actions, sharing events, and playlist opens (rate-limited per user/day). |

## 3. Architecture overview

```
Browser  ─►  Next.js 15 (App Router)  ─►  Supabase (Postgres + Auth + RLS)
  │              │                          │
  │              ├── React Server Components (reads)
  │              ├── Server Actions (writes, with role/ownership checks)
  │              └── Route Handlers (invite-accept, auth-callback)
  │
  └── Client Components only where interactive (transpose slider,
      playlist drag-reorder, theme toggle, font slider, autoscroll,
      fullscreen).

SMTP server (church-hosted)  ◄── nodemailer (invitations, share emails)
                             ◄── Supabase Auth (configured in Dashboard)
```

**Three-layer authorization on every mutation:**
1. Zod input validation.
2. Handler-side role + ownership checks (`requireRole`, `requireOwnerOrAdmin`).
3. Postgres Row-Level Security policies.

## 4. Data model

```sql
create type user_role as enum ('admin', 'leader', 'musician');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role user_role not null default 'musician',
  created_at timestamptz not null default now()
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  role user_role not null,
  invited_by uuid not null references profiles(id),
  token text not null unique,            -- bcrypt hash; raw token only sent via email
  expires_at timestamptz not null,       -- default now() + interval '72 hours'
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on invitations (email) where accepted_at is null;

create table songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  language text not null check (language in ('de','en','ta')),
  original_key text not null,            -- e.g. 'G', 'Eb', 'F#m'
  bpm int check (bpm between 30 and 300),
  time_signature text,                   -- e.g. '4/4', '6/8'
  body_chordpro text not null,           -- single source of truth
  notes text,
  tags text[] not null default '{}',
  created_by uuid not null references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on songs using gin (tags);
create index on songs using gin (to_tsvector('simple', title));
create index on songs (language);

create table playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scheduled_for date,
  description text,
  owner_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on playlists (owner_id);
create index on playlists (scheduled_for);

create table playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  song_id uuid not null references songs(id) on delete restrict,
  position int not null,
  transpose_semitones int not null default 0,
  capo int,
  performance_notes text,
  unique (playlist_id, position)
);
create index on playlist_items (playlist_id);

create table playlist_versions (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,               -- frozen items + song bodies at save time
  saved_by uuid not null references profiles(id),
  saved_at timestamptz not null default now(),
  unique (playlist_id, version)
);

create table audit_log (
  id bigserial primary key,
  actor_id uuid not null references profiles(id),
  action text not null,                  -- enum-like: see § 8
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (created_at desc);

create table auth_attempts (
  id bigserial primary key,
  email citext,
  ip inet,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index on auth_attempts (email, created_at desc);
create index on auth_attempts (ip, created_at desc);
```

**Design notes:**
- ChordPro body is canonical — transposition is computed at render time, originals never mutated.
- `playlist_versions.snapshot` freezes a JSON copy of items + song bodies so a saved version stays stable even if a song is later edited.
- `tags text[]` with GIN index keeps tagging simple without a join table.
- `citext` on `invitations.email` so case differences don't create duplicates.

## 5. Chord transposition engine

Pure TypeScript, no I/O, lives at `src/lib/chordpro/`. Tested first.

### Public API

```ts
export type Accidental = 'sharp' | 'flat';

export interface ParsedChord {
  root: PitchClass;          // 0..11, C = 0
  rootText: string;
  quality: string;           // 'm', '7', 'maj7', 'sus4', 'dim', 'aug', 'add9', ...
  bass?: PitchClass;
  bassText?: string;
  raw: string;
}

export function parseChord(token: string): ParsedChord | null;
export function transposeChord(token: string, semitones: number, prefer?: Accidental): string;
export function transposeChordPro(body: string, semitones: number, prefer?: Accidental): string;
export function transposeKey(originalKey: string, semitones: number, prefer?: Accidental): string;
export function detectKeyAccidental(originalKey: string): Accidental;
export function tokenizeChordPro(body: string): ChordProToken[];
```

### Algorithm

1. **Tokenize** the ChordPro body into a stream of `text | chord | directive | newline` tokens. Anything in `[...]` is a chord token. `{title:...}`, `{comment:...}`, `{start_of_chorus}` etc. pass through untouched.
2. **Parse a chord token** with `^([A-G])(b|#)?([^/]*)(?:\/([A-G])(b|#)?)?$`. Group 1 = root letter, 2 = accidental, 3 = quality (verbatim), 4–5 = bass. Map root letter+accidental → pitch class 0..11.
3. **Transpose** by `((pitch + semitones) % 12 + 12) % 12`, then convert back to a letter using the *preferred accidental*. Default preference comes from `detectKeyAccidental(originalKey)`: keys `F, Bb, Eb, Ab, Db, Gb, Cb` and their relative minors lean flat; `G, D, A, E, B, F#, C#` and relatives lean sharp; `C / Am` defaults to sharp but UI can override.
4. **Render** as `root + quality + ('/' + bass)?`. Quality preserved verbatim — `Cmaj7#11` round-trips exactly.
5. **Body transpose** walks tokens, replaces each chord token, leaves text/directives/whitespace untouched. Alignment preserved by ChordPro's position-anchored model.

### Edge cases pinned by tests

| # | Case | Expected |
|---|---|---|
| 1 | `C` +2 | `D` |
| 2 | `Bb` +1 | `B` |
| 3 | `B` +1 | `C` (octave wrap) |
| 4 | `F#m` +0 | `F#m` (identity) |
| 5 | `G/B` +5 | `C/E` (bass transposes too) |
| 6 | `Cmaj7` +3 | `Ebmaj7` |
| 7 | `Csus4` -1 | `Bsus4` |
| 8 | `Caug`, `Cdim7`, `C°` | quality verbatim |
| 9 | `[N.C.]` | unchanged pass-through |
| 10 | Negative semitones, `>12`, `<-12` | normalized |
| 11 | `transpose(transpose(x, n), -n) === x` | property test (fast-check) |
| 12 | Original key `F` +1 → `Gb`, not `F#` | accidental policy |
| 13 | Body with directives | directives untouched |
| 14 | `[G]Amazing[C]grace` +2 → `[A]Amazing[D]grace` | positions preserved |
| 15 | Empty body / only-text / only-chords | sensible output |
| 16 | Tamil lyrics with Latin chords | chords transpose, Tamil text untouched |

### Why a custom engine

`chordsheetjs` is CJS-only and the parser doesn't preserve extensions like `Cmaj7#11` cleanly. `chord-transposer` mishandles slash-chord bass in some cases. A ~200-LOC custom engine with strong tests is more maintainable, smaller bundle, and gives full control over accidental preference.

## 6. API surface

### Server Actions (in `src/server/actions/`)

```ts
// songs.ts
createSong(input)          // admin
updateSong(id, input)      // admin
deleteSong(id)             // admin
listSongs(filter?)         // any band member
getSong(id)                // any band member

// playlists.ts
createPlaylist(input)                                         // leader|admin
updatePlaylist(id, input)                                     // owner|admin
deletePlaylist(id)                                            // owner|admin
listPlaylists()                                               // any band member
getPlaylist(id)                                               // any band member
addSongToPlaylist(playlistId, songId, opts?)                  // owner|admin
reorderPlaylistItems(playlistId, orderedItemIds[])            // owner|admin
updatePlaylistItem(itemId, patch)                             // owner|admin
removePlaylistItem(itemId)                                    // owner|admin
savePlaylistVersion(playlistId)                               // owner|admin
sharePlaylist(playlistId, message?)                           // owner|admin → SMTP send + audit row

// invitations.ts
sendInvitation(input)         // admin
listPendingInvitations()      // admin
revokeInvitation(id)          // admin

// profile.ts
updateMyProfile(input)        // self
adminSetUserRole(id, role)    // admin
```

Every action begins with `requireRole(...)` or `requireOwnerOrAdmin(...)`. Inputs validated with Zod. Errors thrown as typed (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`) and caught at the action boundary.

### Route Handlers (in `src/app/api/`)

```
GET  /api/invitations/accept?token=...   → validates token, sets up auth, redirects
POST /api/auth/callback                  → Supabase auth code exchange
```

That's it. No export endpoints. No JSON public API.

### Authorization helpers

```ts
async function requireRole(...allowed: UserRole[]): Promise<{ user, profile, supabase }>;
async function requireOwnerOrAdmin(playlistId: string): Promise<{ profile, supabase }>;
```

## 7. UI / UX

### Information architecture

```
/sign-in
/accept-invite?token=...

/                       (logged-in home)
  /songs                list, search, filter; "+ New" if admin
  /songs/[id]           viewer (transpose, font, theme, autoscroll, fullscreen)
  /songs/new            admin: editor (ChordPro source ⇄ live preview)
  /songs/[id]/edit      admin: editor

  /playlists            list; "+ New" if leader|admin
  /playlists/[id]       view (read for everyone, edit ribbon for owner|admin)
  /playlists/[id]/play/[idx]   fullscreen performance mode

  /admin                admin only
    /admin/users
    /admin/invites
```

### Layout shell

- **Mobile**: top bar (logo · context title · kebab) + bottom nav (Songs · Playlists · Admin? · Me).
- **≥md**: collapsible side rail.
- **Drawer/sheet** for ephemeral controls — never modals over the song view.

### Song viewer

- **Two-line render**: chords float visually above the anchored lyric character. Computed in JS from lyric-text widths so chord-width changes (`C` vs `C#`) don't break alignment.
- **Sticky header**: title · original key · current key · BPM · transpose `−`/`+`.
- **Font size**: 5 steps S/M/L/XL/XXL, persisted in localStorage. "Stage XL" preset.
- **Themes**: light, dark, **stage dark** (`#000` bg, warm-amber chords).
- **Auto-scroll**: speed slider proportional to BPM. Tap to pause.
- **Fullscreen**: native Fullscreen API.
- **Capo display**: shows played + sounding chord, e.g. `D (capo 2 → E)`.

### Playlist performance mode

- One song fullscreen. Edge-swipe / arrow keys / Bluetooth pedal `PageUp/PageDown` navigates.
- Top-edge tap reveals a thin progress strip with tap-to-jump song picker.
- Per-song notes show as a dismissible chip when landing on a song.
- Transposition pre-applied from playlist's per-song setting.

### Editor (admin)

- Split: ChordPro source ⇄ live preview, stacks on mobile.
- Source pane: textarea + light syntax highlighting (chord tokens highlighted, directives dimmed).
- **Validate on keystroke**: unparseable tokens get a red squiggle and a sidebar list. Save allowed but with a confirmation. The engine treats unparseable tokens as pass-through, but the editor surfaces them so authors see typos.
- Title / language / key / BPM / time-sig / tags / notes form rail above.
- Auto-save draft to localStorage.

### Playlist builder

- Left: song picker (search + filter). Right: ordered playlist with drag handles (touch + mouse).
- Each row: title · language flag · transpose chip (tap → semitone slider) · capo · notes button · remove.
- "Save version" snapshots the current state to `playlist_versions`.
- "Share" button sends a templated SMTP email to all band members and writes one `audit_log` row.

### Visual direction

- **Type**: Inter for UI. **Noto Sans** as primary lyric face (Latin + German diacritics). **Noto Sans Tamil** for `ta` songs. Variable fonts, language-subset, only used weights.
- **Color**: neutral slate base + warm-amber accent for chords and primary actions. Stage-dark theme = pure black + amber chords (low blue light).
- **Density**: comfortable on phones; compact-but-not-cramped on laptops. Tap targets ≥ 44px.
- **Motion**: minimal. 150ms drawer slide. No parallax, no animated backgrounds.
- **Icons**: Lucide stroke-based monochrome. No emoji.

### NOT building in v1

- No rich-text editor (ChordPro source only).
- No song comments / threads.
- No analytics dashboard.
- No multi-tenant (one church, one workspace).
- No PWA install nags (manifest is set, but no engagement prompts).

## 8. Security model

### Layer 1 — Input validation (Zod)

Every Server Action input runs through Zod first. String length caps: `title ≤ 200`, `body_chordpro ≤ 50_000`, `notes ≤ 5_000`, `tag ≤ 40`, `tags array ≤ 20`. Constrained regexes on `original_key` (`^[A-G](#|b)?m?$`), `time_signature` (`^\d+\/\d+$`), `language` enum.

### Layer 2 — Handler authorization

`requireRole(...allowed)` and `requireOwnerOrAdmin(playlistId)` run before every side effect. Profile fetched fresh from the authenticated Supabase server client per call — no role claim in JWTs is ever trusted. Only an admin can mutate `profiles.role`.

### Layer 3 — Row-Level Security

Even if a handler is buggy, RLS makes unauthorized data access impossible.

```sql
-- Helper: SECURITY DEFINER to avoid RLS recursion when policies query profiles.
create function auth.role_of(uid uuid) returns user_role
  language sql stable security definer
  as $$ select role from profiles where id = uid $$;

-- profiles
alter table profiles enable row level security;
create policy "read own + admin reads all" on profiles for select using (
  id = auth.uid() or auth.role_of(auth.uid()) = 'admin'
);
create policy "admin updates roles" on profiles for update using (
  auth.role_of(auth.uid()) = 'admin'
) with check (auth.role_of(auth.uid()) = 'admin');
create policy "self updates own profile (not role)" on profiles for update using (
  id = auth.uid()
) with check (
  id = auth.uid() and role = (select role from profiles where id = auth.uid())
);

-- songs
alter table songs enable row level security;
create policy "any band member reads songs" on songs for select using (
  auth.role_of(auth.uid()) in ('admin','leader','musician')
);
create policy "admin writes songs" on songs for all using (
  auth.role_of(auth.uid()) = 'admin'
) with check (auth.role_of(auth.uid()) = 'admin');

-- playlists
alter table playlists enable row level security;
create policy "any band member reads playlists" on playlists for select using (
  auth.role_of(auth.uid()) in ('admin','leader','musician')
);
create policy "leader|admin creates" on playlists for insert with check (
  auth.role_of(auth.uid()) in ('leader','admin') and owner_id = auth.uid()
);
create policy "owner|admin updates" on playlists for update using (
  owner_id = auth.uid() or auth.role_of(auth.uid()) = 'admin'
);
create policy "owner|admin deletes" on playlists for delete using (
  owner_id = auth.uid() or auth.role_of(auth.uid()) = 'admin'
);

-- playlist_items: gated through parent
alter table playlist_items enable row level security;
create policy "read items if can read playlist" on playlist_items for select using (
  exists (select 1 from playlists p where p.id = playlist_id)
);
create policy "write items if owner|admin" on playlist_items for all using (
  exists (
    select 1 from playlists p
    where p.id = playlist_id
      and (p.owner_id = auth.uid() or auth.role_of(auth.uid()) = 'admin')
  )
);

-- invitations: admin only
alter table invitations enable row level security;
create policy "admin only" on invitations for all using (
  auth.role_of(auth.uid()) = 'admin'
) with check (auth.role_of(auth.uid()) = 'admin');

-- audit_log: admin reads; writes via service role from server actions
alter table audit_log enable row level security;
create policy "admin reads audit" on audit_log for select using (
  auth.role_of(auth.uid()) = 'admin'
);
```

### Authentication

- **Invitation flow**: admin submits email+role → server generates 32-byte random token, stores **bcrypt hash**, sends raw token in email link via SMTP. Link `/api/invitations/accept?token=...` validates with constant-time hash compare, checks `expires_at` (default 72h) + `accepted_at IS NULL`, creates the auth user via Supabase Admin API, creates the `profiles` row with the invited role, marks `accepted_at = now()`, and sets the Supabase session cookie. Redirects to `/onboard` where the user sets display name + password before landing on `/`. The token is single-use — re-using it returns 410 Gone.
- **Magic-link sign-in** for returning users via Supabase Auth + same SMTP server.
- **No OAuth providers** in v1.
- **Session**: Supabase SSR cookies — `httpOnly`, `Secure`, `SameSite=Lax`. Refresh in middleware.
- **Password requirements**: ≥ 12 chars, ≥ 1 non-alphanumeric. Server-enforced.
- **Brute-force protection**: 10/IP/15min and 5/email/15min on sign-in attempts via `auth_attempts` table + Postgres function. No Redis required.

### Application-level hardening

- **Output encoding**: lyrics and chords render through React's auto-escaping JSX path. The viewer never injects raw HTML strings; if we ever render user markdown later, it goes through `sanitize-html` with a strict tag/attribute allowlist before any HTML rendering.
- **Security headers** (via `next.config` + middleware):
  - CSP: `default-src 'self'; script-src 'self' 'nonce-{n}'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' https://<project>.supabase.co; frame-ancestors 'none'`
  - HSTS: `max-age=31536000; includeSubDomains; preload`
  - `Referrer-Policy: same-origin`
  - `X-Content-Type-Options: nosniff`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **CSRF**: SameSite=Lax cookie + Next's Server Action token + middleware Origin/Host equality check.
- **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` and SMTP creds only in `.env`. CI step greps `.next/static/**/*.js` for `service_role` and fails build if found.
- **Dependency hygiene**: `npm audit --omit=dev` in CI, Dependabot weekly.

### Audit log scope

- `song.create`, `song.update`, `song.delete` (admin)
- `invite.send`, `invite.revoke` (admin)
- `profile.role_change` (admin)
- `playlist.create`, `playlist.update`, `playlist.delete` (any owner)
- `playlist.share_sent` — recipient count + optional message
- `playlist.version_save`
- `playlist.opened` — first open per (user, playlist, day), via fire-and-forget `recordOpen`

### Out of scope for v1

- 2FA / passkeys (can add via Supabase Auth later).
- Per-resource ACLs.
- Field-level encryption.

## 9. Testing strategy

### Layer 1 — Unit (Vitest), TDD-driven, written first

```
src/lib/chordpro/__tests__/parse.test.ts                 ~40 grammar cases
src/lib/chordpro/__tests__/transpose.test.ts             16 cases from § 5
src/lib/chordpro/__tests__/transpose.property.test.ts    fast-check round-trip
src/lib/chordpro/__tests__/render.test.ts                ChordPro → React tree shape
src/server/auth/__tests__/require.test.ts                role gate behavior
src/server/actions/__tests__/songs.actions.test.ts       admin-only enforcement
src/server/actions/__tests__/playlists.actions.test.ts   owner|admin enforcement
src/server/actions/__tests__/invitations.actions.test.ts token hashing, expiry, single-use
```

Property tests with **fast-check**:
- Round trip: `transpose(transpose(x, n), -n) === x`.
- Idempotence at 0.
- Octave invariance at ±12.
- Bass parallelism: `transpose(G/B, n)`'s bass = transposed B.

### Layer 2 — RLS integration (Vitest + local Supabase)

CI spins up a Supabase service container. Three seeded users (admin/leader/musician). A matrix of `(actor, action, target) → allow|deny` runs against the live DB to catch silent RLS regressions.

### Layer 3 — E2E (Playwright)

```
e2e/auth-flow.spec.ts           invite → accept → password → home
e2e/song-crud.spec.ts           admin creates/edits/deletes
e2e/song-viewer.spec.ts         transpose changes rendered chord, font persists
e2e/multilingual.spec.ts        DE + EN + TA render correctly (Tamil = screenshot diff)
e2e/playlist-build.spec.ts      create, drag-reorder, set transpose, save version
e2e/playlist-share.spec.ts      share button → SMTP intercepted, audit row written
e2e/rls-musician.spec.ts        musician 403 on admin pages
e2e/performance-mode.spec.ts    arrow-key swipe, fullscreen toggle
```

### Layer 4 — Static checks

- `tsc --noEmit` (strict, `noUncheckedIndexedAccess: true`).
- `eslint` with `eslint-plugin-security` + Next.js recommended.
- Bundle scan: grep `service_role` in `.next/static/**/*.js`, fail CI on hit.

### CI

GitHub Actions, three parallel jobs: `unit`, `rls-integration`, `e2e`. Target combined runtime < 5 min.

## 10. Seed data

### Users (3, dev only)

| Email | Role |
|---|---|
| `admin@nlc-burgdorf.local` | admin |
| `leader@nlc-burgdorf.local` | leader |
| `musician@nlc-burgdorf.local` | musician |

Created via Supabase Admin API in `scripts/seed.ts`. Dev passwords from `SEED_PASSWORD` env var. **Production seed creates only the first admin via a magic-link** — no plaintext password ever in prod.

### Songs (6 — public-domain hymns)

| # | Title | Language | Key | Time | BPM | Tags |
|---|---|---|---|---|---|---|
| 1 | Amazing Grace | en | G | 4/4 | 80 | hymn, classic, grace |
| 2 | Be Thou My Vision | en | Eb | 3/4 | 90 | hymn, irish, worship |
| 3 | Großer Gott, wir loben dich | de | D | 4/4 | 100 | hymn, klassisch, lob |
| 4 | Lobe den Herren, den mächtigen König | de | F | 3/4 | 110 | hymn, klassisch |
| 5 | அற்புதமான இரட்சகர் (Atputhamaana Iratchakar) | ta | G | 4/4 | 75 | தமிழ், ஆராதனை |
| 6 | யேசு என் ஆனந்தம் (Yesu en aanandam) | ta | D | 6/8 | 90 | தமிழ், துதி |

Each song body includes:
- A `{title:}` and `{key:}` directive.
- At least one slash chord (`[G/B]`) — exercises bass transposition.
- At least one extension (`[Cmaj7]` or `[Dsus4]`).
- Verse/chorus structure via `{start_of_verse}` / `{start_of_chorus}` directives.

### Playlists (2)

1. **Sunday Service — May 10** (owner: leader) — 4 songs in mixed languages with mixed transpositions; one `playlist_versions` snapshot saved.
2. **Worship Night — Practice** (owner: leader) — 3 songs, no transpositions, sample notes.

### Invitations (1 pending)

One invitation row addressed to `pending@nlc-burgdorf.local` so `/admin/invites` isn't empty in dev.

### Not seeded

No audit-log rows. No fake share/open events. No avatars.

## 11. Repo structure

```
.
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
├── .env.example
├── .github/workflows/
│   ├── ci.yml                       # unit + rls-integration + e2e
│   └── scan-bundle.yml
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_init.sql            # tables, indexes
│   │   ├── 0002_rls.sql             # all RLS policies
│   │   └── 0003_functions.sql       # auth.role_of, audit triggers
│   └── seed.sql
├── scripts/
│   ├── seed.ts                      # creates auth users + profiles
│   └── check-bundle.ts              # service-role-key leak detector
├── src/
│   ├── app/
│   │   ├── (auth)/sign-in/page.tsx
│   │   ├── (auth)/accept-invite/page.tsx
│   │   ├── (app)/layout.tsx
│   │   ├── (app)/songs/page.tsx
│   │   ├── (app)/songs/[id]/page.tsx
│   │   ├── (app)/songs/new/page.tsx
│   │   ├── (app)/songs/[id]/edit/page.tsx
│   │   ├── (app)/playlists/page.tsx
│   │   ├── (app)/playlists/[id]/page.tsx
│   │   ├── (app)/playlists/[id]/play/[idx]/page.tsx
│   │   ├── (app)/admin/users/page.tsx
│   │   ├── (app)/admin/invites/page.tsx
│   │   └── api/
│   │       ├── invitations/accept/route.ts
│   │       └── auth/callback/route.ts
│   ├── components/
│   │   ├── ui/                      # primitives: Button, Input, Drawer, Sheet
│   │   ├── viewer/                  # SongViewer, ChordLine, TransposeControl, FontSizeControl, AutoScroll
│   │   ├── editor/                  # ChordProEditor, LivePreview, ValidationSidebar
│   │   ├── playlist/                # PlaylistBuilder, PlaylistRow, ReorderHandle, ShareButton
│   │   └── layout/                  # AppShell, BottomNav, SideRail, TopBar
│   ├── lib/
│   │   ├── chordpro/                # the engine + tests
│   │   ├── supabase/                # client, server, admin factories
│   │   ├── auth/                    # session helpers (client side)
│   │   ├── email/                   # nodemailer wrapper, templates
│   │   ├── audit/                   # recordOpen, write helpers
│   │   └── utils/
│   ├── server/
│   │   ├── actions/                 # all Server Actions, schemas next to them
│   │   ├── auth/                    # require.ts, errors.ts
│   │   └── ratelimit/               # auth-attempts.ts
│   ├── styles/
│   │   ├── globals.css              # Tailwind + theme CSS variables
│   │   └── fonts.ts                 # next/font config
│   └── middleware.ts                # session refresh, headers, origin check
├── e2e/
│   └── playwright.config.ts
└── docs/
    └── superpowers/specs/
```

### Tooling

- TypeScript strict, `noUncheckedIndexedAccess: true`.
- Tailwind v4 — CSS variables drive light / dark / stage-dark.
- next/font for Inter + Noto Sans + Noto Sans Tamil.
- Vitest + fast-check (unit + property).
- Playwright (E2E).
- Supabase CLI (local dev DB + migrations).
- Prettier.

## 12. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Silent RLS regression | Data leak | RLS integration tests against real Supabase in CI |
| Service-role key leaks to client bundle | Total compromise | Bundle-scan CI step; only ever import service-role from `src/server/...` |
| Tamil font subset breaks | Lyrics unreadable | Screenshot E2E test on Tamil song; pin Noto Sans Tamil version |
| Chord parser misses an edge case | Wrong chord on stage | Property tests; pass-through for unparseable tokens (no crash); editor surfaces typos |
| Invitation email lands in spam | Onboarding stalls | DKIM/SPF/DMARC on the SMTP domain; admin sees pending invites and can resend |
| Session cookie hijack | Account takeover | httpOnly+Secure+SameSite cookies; HSTS; CSP |
| Stage-dark theme too dim under stage lights | Performance disruption | "Stage XL" preset that boosts both font and contrast; user-overridable |

## 13. Out of scope (deferred to post-v1)

- PDF export, ChordPro export.
- 2FA, passkeys, OAuth providers.
- Public tokenized share links.
- Per-resource ACLs.
- Multi-church / multi-tenant.
- Song-level comments / threads.
- Analytics dashboard.
- WYSIWYG editor.

## 14. Success criteria

The v1 ships when:
- Admin can invite users, edit/delete songs in DE/EN/TA.
- Leader can build a playlist, set per-song transposition, save a version, share it with the band via email.
- Musician can open a shared playlist, view each song with chords above lyrics in dark mode at large font, transpose, and use performance mode (swipe, arrow keys).
- All chord-engine unit tests pass, RLS integration tests pass, E2E happy paths pass.
- No `service_role` string appears in the client bundle.
- Tamil song renders pixel-correctly on the screenshot test.
