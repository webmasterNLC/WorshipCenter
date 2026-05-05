# Plan B: Song System + Transposition Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully-tested ChordPro transposition engine and the song surface that uses it. Admins can CRUD songs in DE/EN/TA. Any band member can view a song with chords above lyrics, transpose, switch theme/font, autoscroll, and go fullscreen. Tamil renders correctly in a real browser. RLS keeps writes admin-only. Plan A's outstanding security follow-ups land first as a hardening preamble.

**Architecture:** Song body stored canonically as ChordPro inline (e.g., `[G]Amazing [C]grace`). The transposition engine is a pure TypeScript module with property-based tests — no I/O, no DB, no React. The viewer is a Server Component that reads the song, with small client islands for the transpose slider, font/theme controls, autoscroll, and fullscreen. The editor is split-pane (source ↔ live preview), live-validating chord tokens.

**Tech stack additions on top of Plan A:**
- `fast-check` (already installed) for property tests on the transposition engine.
- `next/font` for Inter, Noto Sans, **Noto Sans Tamil** with language-subset.
- Tailwind v4 stage-dark theme variant.
- Playwright screenshot diffing for the Tamil-rendering test.

**Reference docs:**
- Spec: [`docs/superpowers/specs/2026-05-04-nlc-burgdorf-songdrop-design.md`](../specs/2026-05-04-nlc-burgdorf-songdrop-design.md)
- Plan A foundation (already shipped): [`2026-05-04-plan-a-foundation.md`](2026-05-04-plan-a-foundation.md)
- Plan A follow-ups (folded in as Phase 0 of this plan): [`2026-05-04-plan-a-followups.md`](2026-05-04-plan-a-followups.md)

**Demo at the end:** Sign in as admin, create a song with `[G]Amazing [C]grace, how [D]sweet`, see it render with chords above lyrics. Tap the `+` chip to transpose to `+2` — chord row updates to `A / D / E`. Toggle stage-dark theme — black background, amber chords. Open a Tamil song — `Noto Sans Tamil` renders glyphs correctly, screenshot test pinned. Sign in as musician, confirm read-only (no edit button). Save a German song with umlauts and `[F#]/[Bb]` chords; round-trip via transpose −1 / +1 leaves body identical.

**Out of scope (Plan C):** playlists, per-song-in-playlist transposition, sharing, performance mode, audit playlist events, `playlist_versions`.

---

## Phase 0 — Plan A security follow-ups (hardening preamble)

These items came out of Plan A's final code review. They live first because they harden the auth surface that everything in Plan B builds on.

### Task 0.1: CSP nonce-based `script-src`

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Generate a per-request nonce in middleware and propagate via header**

In `src/middleware.ts`, before the headers block, add:
```ts
import { randomBytes } from 'node:crypto';
// ...
const nonce = randomBytes(16).toString('base64');
const requestHeaders = new Headers(req.headers);
requestHeaders.set('x-nonce', nonce);
const res = NextResponse.next({ request: { headers: requestHeaders } });
res.headers.set('x-nonce', nonce);
```

(Restructure: declare `nonce` and `requestHeaders` BEFORE constructing `res`. Then the existing supabase + headers code continues unchanged but uses the new `res`.)

- [ ] **Step 2: Replace the CSP `script-src 'unsafe-inline'` with nonce + strict-dynamic**

```ts
res.headers.set(
  'Content-Security-Policy',
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data:",
    `connect-src 'self' ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin}`,
    "frame-ancestors 'none'",
  ].join('; '),
);
```

- [ ] **Step 3: Read the nonce in the root layout**

```tsx
import { headers } from 'next/headers';
// ...
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh" {...(nonce ? { 'data-nonce': nonce } : {})}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm build`

- [ ] **Step 5: Commit** — `fix(security): nonce-based CSP for script-src`

### Task 0.2: Brute-force throttling on sign-in

**Files:**
- Create: `supabase/migrations/0004_auth_rate_limit.sql`
- Create: `src/server/ratelimit/auth-attempts.ts`
- Modify: `src/app/(auth)/sign-in/page.tsx`

- [ ] **Step 1: Migration 0004 — `check_auth_rate` Postgres function**

```sql
-- 0004_auth_rate_limit.sql

create or replace function public.check_auth_rate(
  p_email citext,
  p_ip inet
) returns boolean
  language plpgsql security definer
  set search_path = public
  as $$
declare
  ip_count int;
  email_count int;
begin
  select count(*) into ip_count from auth_attempts
    where ip = p_ip
      and created_at > now() - interval '15 minutes';
  if ip_count >= 10 then return false; end if;

  if p_email is not null then
    select count(*) into email_count from auth_attempts
      where email = p_email
        and created_at > now() - interval '15 minutes';
    if email_count >= 5 then return false; end if;
  end if;

  return true;
end;
$$;

revoke all on function public.check_auth_rate(citext, inet) from public;
```

- [ ] **Step 2: TypeScript wrapper** — `src/server/ratelimit/auth-attempts.ts`

```ts
import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function checkAuthRate(input: { email?: string; ip?: string | null }): Promise<boolean> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc('check_auth_rate', {
    p_email: input.email ?? null,
    p_ip: input.ip ?? null,
  });
  if (error) return false; // fail closed
  return Boolean(data);
}

export async function recordAuthAttempt(input: { email?: string; ip?: string | null; succeeded: boolean }): Promise<void> {
  const sb = createSupabaseAdminClient();
  await sb.from('auth_attempts').insert({
    email: input.email ?? null,
    ip: input.ip ?? null,
    succeeded: input.succeeded,
  });
}
```

- [ ] **Step 3: Wire into `signInAction` in `src/app/(auth)/sign-in/page.tsx`**

```ts
async function signInAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) redirect('/sign-in?error=invalid_email');

  const { headers } = await import('next/headers');
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const { checkAuthRate, recordAuthAttempt } = await import('@/server/ratelimit/auth-attempts');
  const ok = await checkAuthRate({ email, ip });
  if (!ok) {
    await recordAuthAttempt({ email, ip, succeeded: false });
    redirect('/sign-in?error=rate_limited');
  }

  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.APP_ORIGIN}/api/auth/callback?next=/home` },
  });
  if (error) {
    await recordAuthAttempt({ email, ip, succeeded: false });
    console.error('[signin] supabase error:', error.message);
    redirect('/sign-in?error=signin_failed');
  }
  await recordAuthAttempt({ email, ip, succeeded: true });
  redirect('/sign-in?sent=1');
}
```

Add a friendly mapper at the bottom of the file:
```ts
function friendlyAuthError(code: string): string {
  switch (code) {
    case 'invalid_email': return 'Please enter a valid email address.';
    case 'rate_limited':  return 'Too many sign-in attempts. Please wait a few minutes.';
    default: return 'Sign-in failed. Please try again.';
  }
}
```

And use it where the page renders the error: `{error && <p>{friendlyAuthError(error)}</p>}`.

- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm build`

- [ ] **Step 5: Commit** — `feat(security): brute-force rate limit on sign-in`

### Task 0.3: HMAC prefix index on `invitations` to fix bcrypt-loop DoS

**Files:**
- Create: `supabase/migrations/0005_invitation_token_prefix.sql`
- Modify: `src/lib/invitations/token.ts`
- Modify: `src/server/actions/invitations.ts`
- Modify: `src/app/api/invitations/accept/route.ts`
- Modify: `.env.example`
- Modify: `src/lib/invitations/__tests__/token.test.ts`

- [ ] **Step 1: Migration**

```sql
-- 0005_invitation_token_prefix.sql

alter table invitations add column token_prefix text;
create index invitations_token_prefix_idx on invitations (token_prefix)
  where accepted_at is null;
```

- [ ] **Step 2: Add env var** — append to `.env.example`:
```
INVITATION_HMAC_SECRET=<random-32-byte-base64>
```

- [ ] **Step 3: Token prefix helper** — append to `src/lib/invitations/token.ts`:

```ts
import { createHmac } from 'node:crypto';

export function tokenPrefix(raw: string): string {
  const secret = process.env.INVITATION_HMAC_SECRET;
  if (!secret) throw new Error('INVITATION_HMAC_SECRET not set');
  return createHmac('sha256', secret).update(raw).digest('hex').slice(0, 16);
}
```

- [ ] **Step 4: Tests for `tokenPrefix`** (TDD — write first, watch fail, then add the export above):

```ts
describe('tokenPrefix', () => {
  beforeAll(() => { process.env.INVITATION_HMAC_SECRET = 'test-secret-do-not-use-in-prod'; });

  it('returns 16 hex chars', () => {
    expect(tokenPrefix('any-token')).toMatch(/^[0-9a-f]{16}$/);
  });
  it('is deterministic for the same input', () => {
    expect(tokenPrefix('abc')).toBe(tokenPrefix('abc'));
  });
  it('differs for different inputs', () => {
    expect(tokenPrefix('abc')).not.toBe(tokenPrefix('abd'));
  });
  it('throws when secret is missing', () => {
    const original = process.env.INVITATION_HMAC_SECRET;
    delete process.env.INVITATION_HMAC_SECRET;
    expect(() => tokenPrefix('x')).toThrow();
    process.env.INVITATION_HMAC_SECRET = original;
  });
});
```

Run `pnpm test -t tokenPrefix` — confirm 4 pass.

- [ ] **Step 5: Insert prefix on send** — in `src/server/actions/invitations.ts`, update `InvitationDeps.db.insertInvitation` to take `token_prefix: string`, compute it in `makeSendInvitation` via `tokenPrefix(raw)`, and pass through to the row.

- [ ] **Step 6: Use prefix on accept** — in `src/app/api/invitations/accept/route.ts`:

```ts
import { verifyToken, tokenPrefix } from '@/lib/invitations/token';
// ...
const prefix = tokenPrefix(token);
const { data: candidates, error: listError } = await sb
  .from('invitations')
  .select('id, email, role, token_hash, expires_at, accepted_at, invited_by, token_prefix')
  .is('accepted_at', null)
  .gt('expires_at', new Date().toISOString())
  .or(`token_prefix.eq.${prefix},token_prefix.is.null`);
```

Everything else in the route stays the same.

- [ ] **Step 7: Verify** — `pnpm typecheck && pnpm test && pnpm build`. Test count grows by 4 (Plan A's 15 + 4 prefix tests = 19).

- [ ] **Step 8: Commit** — `fix(security): HMAC prefix index to fix bcrypt-loop DoS`

### Task 0.4: Action error boundary helper + sendInvitation dedup + error-message hardening

**Files:**
- Create: `src/server/actions/_action-result.ts`
- Modify: `src/server/actions/invitations.ts`
- Modify: `src/app/(app)/admin/invites/page.tsx`
- Modify: `src/app/(auth)/onboard/page.tsx`

- [ ] **Step 1: `runAction` wrapper** — `src/server/actions/_action-result.ts`:

```ts
import 'server-only';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError } from '@/server/auth/errors';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; issues?: unknown } };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: { code: e.code, message: e.message } };
    if (e instanceof ForbiddenError) return { ok: false, error: { code: e.code, message: e.message } };
    if (e instanceof NotFoundError) return { ok: false, error: { code: e.code, message: e.message } };
    if (e instanceof ValidationError) return { ok: false, error: { code: e.code, message: e.message, issues: e.issues } };
    console.error('[action error]', e);
    return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } };
  }
}
```

- [ ] **Step 2: Dedup in sendInvitation** — extend `db` interface with `deletePendingByEmail(email: string): Promise<void>`, add the wired impl that runs `delete from invitations where email = ? and accepted_at is null`, and call it before generating the token in `makeSendInvitation`. Add a test: assert `deletePendingByEmail` is called once with the lowercased email.

- [ ] **Step 3: Friendly error mapping in onboard page** — replace `redirect(\`/onboard?error=\${encodeURIComponent(passError.message)}\`)` with `redirect('/onboard?error=password_failed')`. Add a `friendlyError(code)` mapper at the bottom of the file matching the pattern from sign-in.

- [ ] **Step 4: Wrap admin invite form actions with `runAction`** — in `src/app/(app)/admin/invites/page.tsx`:

```tsx
import { runAction } from '@/server/actions/_action-result';
// ...
async function sendAction(formData: FormData) {
  'use server';
  const result = await runAction(() =>
    sendInvitation({
      email: String(formData.get('email') ?? ''),
      role: String(formData.get('role') ?? '') as 'admin'|'leader'|'musician',
    }),
  );
  if (!result.ok) {
    redirect(`/admin/invites?error=${encodeURIComponent(result.error.code)}`);
  }
}
```

Same wrapper around `revokeAction`. Render the resulting error param as a banner.

- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm test && pnpm lint && pnpm build`. Test count: 20 (Plan A 15 + 4 prefix + 1 dedup).

- [ ] **Step 6: Commit** — `feat(actions): runAction wrapper + sendInvitation dedup + error-code redirects`

Phase 0 complete. Plan A's critical security follow-ups are in.

---

## Phase 1 — Songs database

### Task 1.1: Migration `0006_songs.sql` — songs table + indexes

**Files:**
- Create: `supabase/migrations/0006_songs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0006_songs.sql

create table songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  language text not null check (language in ('de','en','ta')),
  original_key text not null check (original_key ~ '^[A-G](#|b)?m?$'),
  bpm int check (bpm between 30 and 300),
  time_signature text check (time_signature ~ '^\d+/\d+$'),
  body_chordpro text not null,
  notes text,
  tags text[] not null default '{}',
  created_by uuid not null references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_tags_gin on songs using gin (tags);
create index songs_title_tsv on songs using gin (to_tsvector('simple', title));
create index songs_language_idx on songs (language);

create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger songs_updated_at
  before update on songs
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Commit** — `feat(db): songs table with constraints, GIN indexes, updated_at trigger`

### Task 1.2: Migration `0007_songs_rls.sql` — RLS

**Files:**
- Create: `supabase/migrations/0007_songs_rls.sql`

- [ ] **Step 1: Write**

```sql
-- 0007_songs_rls.sql

alter table songs enable row level security;

create policy "songs: any band member reads" on songs for select
  using (public.role_of(auth.uid()) in ('admin','leader','musician'));

create policy "songs: admin writes" on songs for all
  using (public.role_of(auth.uid()) = 'admin')
  with check (public.role_of(auth.uid()) = 'admin');
```

- [ ] **Step 2: Commit** — `feat(db): RLS for songs — band reads, admin writes`

---

## Phase 2 — ChordPro engine: parser

The keystone module. Pure TypeScript, no I/O. Built test-first.

### Task 2.1: Pitch & accidental utilities (TDD)

**Files:**
- Create: `src/lib/chordpro/pitch.ts`
- Create: `src/lib/chordpro/__tests__/pitch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  pitchClassFromRoot, rootFromPitchClass, detectKeyAccidental, normalizeSemitones,
} from '../pitch';

describe('pitchClassFromRoot', () => {
  it.each([
    ['C', 0], ['C#', 1], ['Db', 1], ['D', 2], ['D#', 3], ['Eb', 3],
    ['E', 4], ['F', 5], ['F#', 6], ['Gb', 6], ['G', 7], ['G#', 8],
    ['Ab', 8], ['A', 9], ['A#', 10], ['Bb', 10], ['B', 11],
  ])('%s -> %i', (root, expected) => {
    expect(pitchClassFromRoot(root)).toBe(expected);
  });

  it('returns null for unknown letters', () => {
    expect(pitchClassFromRoot('H')).toBeNull();
    expect(pitchClassFromRoot('')).toBeNull();
  });
});

describe('rootFromPitchClass', () => {
  it('uses sharps when prefer=sharp', () => {
    expect(rootFromPitchClass(1, 'sharp')).toBe('C#');
    expect(rootFromPitchClass(3, 'sharp')).toBe('D#');
    expect(rootFromPitchClass(6, 'sharp')).toBe('F#');
    expect(rootFromPitchClass(10, 'sharp')).toBe('A#');
  });

  it('uses flats when prefer=flat', () => {
    expect(rootFromPitchClass(1, 'flat')).toBe('Db');
    expect(rootFromPitchClass(3, 'flat')).toBe('Eb');
    expect(rootFromPitchClass(6, 'flat')).toBe('Gb');
    expect(rootFromPitchClass(10, 'flat')).toBe('Bb');
  });

  it('naturals are independent of preference', () => {
    expect(rootFromPitchClass(0, 'sharp')).toBe('C');
    expect(rootFromPitchClass(0, 'flat')).toBe('C');
    expect(rootFromPitchClass(7, 'sharp')).toBe('G');
    expect(rootFromPitchClass(7, 'flat')).toBe('G');
  });
});

describe('detectKeyAccidental', () => {
  it.each([
    ['F','flat'], ['Bb','flat'], ['Eb','flat'], ['Ab','flat'],
    ['Db','flat'], ['Gb','flat'], ['Cb','flat'],
    ['Dm','flat'], ['Gm','flat'], ['Cm','flat'], ['Fm','flat'], ['Bbm','flat'],
    ['G','sharp'], ['D','sharp'], ['A','sharp'], ['E','sharp'], ['B','sharp'],
    ['F#','sharp'], ['C#','sharp'],
    ['Em','sharp'], ['Bm','sharp'], ['F#m','sharp'], ['C#m','sharp'],
    ['C','sharp'], ['Am','sharp'],
  ])('%s -> %s', (key, pref) => {
    expect(detectKeyAccidental(key)).toBe(pref);
  });
});

describe('normalizeSemitones', () => {
  it.each([
    [0, 0], [12, 0], [-12, 0], [13, 1], [-1, 11], [-13, 11], [25, 1],
  ])('%i -> %i', (n, expected) => {
    expect(normalizeSemitones(n)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run, watch fail** — `pnpm test -t "pitchClassFromRoot|rootFromPitchClass|detectKeyAccidental|normalizeSemitones"`

- [ ] **Step 3: Implement `pitch.ts`**

```ts
export type PitchClass = number;
export type Accidental = 'sharp' | 'flat';

const NATURAL_TO_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function pitchClassFromRoot(root: string): PitchClass | null {
  if (!root) return null;
  const letter = root[0];
  if (!letter || !(letter in NATURAL_TO_PC)) return null;
  let pc = NATURAL_TO_PC[letter]!;
  const acc = root[1];
  if (acc === '#') pc = (pc + 1) % 12;
  else if (acc === 'b') pc = (pc + 11) % 12;
  return pc;
}

export function rootFromPitchClass(pc: PitchClass, prefer: Accidental): string {
  const names = prefer === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return names[((pc % 12) + 12) % 12]!;
}

const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb','Cb','Dm','Gm','Cm','Fm','Bbm','Ebm']);
const SHARP_KEYS = new Set(['G','D','A','E','B','F#','C#','Em','Bm','F#m','C#m','G#m','D#m','A#m']);

export function detectKeyAccidental(key: string): Accidental {
  if (FLAT_KEYS.has(key)) return 'flat';
  if (SHARP_KEYS.has(key)) return 'sharp';
  return 'sharp';
}

export function normalizeSemitones(n: number): PitchClass {
  return ((n % 12) + 12) % 12;
}
```

- [ ] **Step 4: Run, pass, commit** — `feat(chordpro): pitch class + accidental utilities`

### Task 2.2: Chord token parser (TDD)

**Files:**
- Create: `src/lib/chordpro/parse.ts`
- Create: `src/lib/chordpro/__tests__/parse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseChord, tokenizeChordPro } from '../parse';

describe('parseChord', () => {
  it.each([
    ['C',     { rootText: 'C',  quality: '', bassText: undefined }],
    ['Cm',    { rootText: 'C',  quality: 'm', bassText: undefined }],
    ['Cmaj7', { rootText: 'C',  quality: 'maj7', bassText: undefined }],
    ['C#m7',  { rootText: 'C#', quality: 'm7', bassText: undefined }],
    ['Bb',    { rootText: 'Bb', quality: '', bassText: undefined }],
    ['F#',    { rootText: 'F#', quality: '', bassText: undefined }],
    ['G/B',   { rootText: 'G',  quality: '', bassText: 'B' }],
    ['G/Bb',  { rootText: 'G',  quality: '', bassText: 'Bb' }],
    ['Cmaj7#11', { rootText: 'C', quality: 'maj7#11', bassText: undefined }],
    ['Cdim7', { rootText: 'C',  quality: 'dim7', bassText: undefined }],
    ['Caug',  { rootText: 'C',  quality: 'aug', bassText: undefined }],
    ['Csus4', { rootText: 'C',  quality: 'sus4', bassText: undefined }],
    ['Cadd9', { rootText: 'C',  quality: 'add9', bassText: undefined }],
  ])('%s', (input, expected) => {
    const r = parseChord(input);
    expect(r).not.toBeNull();
    expect(r!.rootText).toBe(expected.rootText);
    expect(r!.quality).toBe(expected.quality);
    expect(r!.bassText).toBe(expected.bassText);
    expect(r!.raw).toBe(input);
  });

  it.each(['N.C.', '*', 'Chorus', 'Hb', '', '/', 'C/', '/C'])('returns null for %s', (input) => {
    expect(parseChord(input)).toBeNull();
  });
});

describe('tokenizeChordPro', () => {
  it('splits text/chord/directive/newline tokens', () => {
    const tokens = tokenizeChordPro('{title: A}\n[G]Hi[C]there\n');
    const types = tokens.map((t) => t.type);
    expect(types).toContain('directive');
    expect(types).toContain('chord');
    expect(types).toContain('text');
    expect(types).toContain('newline');
  });
  it('preserves chord raw text', () => {
    const tokens = tokenizeChordPro('[G/B]hi');
    const chord = tokens.find((t) => t.type === 'chord');
    expect(chord?.value).toBe('G/B');
  });
  it('ignores brackets that are not closed', () => {
    const tokens = tokenizeChordPro('[unclosed');
    expect(tokens.find((t) => t.type === 'chord')).toBeUndefined();
  });
  it('handles empty body', () => {
    expect(tokenizeChordPro('')).toEqual([]);
  });
  it('preserves Unicode text including Tamil', () => {
    const tokens = tokenizeChordPro('[G]அற்புத[C]மான');
    const text = tokens.filter((t) => t.type === 'text').map((t) => t.value).join('');
    expect(text).toBe('அற்புதமான');
  });
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement `parse.ts`**

```ts
import { pitchClassFromRoot, type PitchClass } from './pitch';

export interface ParsedChord {
  root: PitchClass;
  rootText: string;
  quality: string;
  bass?: PitchClass;
  bassText?: string;
  raw: string;
}

export type ChordProToken =
  | { type: 'text'; value: string }
  | { type: 'chord'; value: string }
  | { type: 'directive'; value: string }
  | { type: 'newline' };

const CHORD_RE = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/;

export function parseChord(token: string): ParsedChord | null {
  const m = CHORD_RE.exec(token);
  if (!m) return null;
  const [, rootLetter, rootAcc = '', quality = '', bassLetter, bassAcc = ''] = m;
  const rootText = `${rootLetter}${rootAcc}`;
  const root = pitchClassFromRoot(rootText);
  if (root === null) return null;
  let bass: PitchClass | undefined;
  let bassText: string | undefined;
  if (bassLetter) {
    bassText = `${bassLetter}${bassAcc}`;
    const b = pitchClassFromRoot(bassText);
    if (b === null) return null;
    bass = b;
  }
  return { root, rootText, quality, bass, bassText, raw: token };
}

export function tokenizeChordPro(body: string): ChordProToken[] {
  const tokens: ChordProToken[] = [];
  let i = 0;
  let textBuf = '';
  const flushText = () => {
    if (textBuf) {
      tokens.push({ type: 'text', value: textBuf });
      textBuf = '';
    }
  };
  while (i < body.length) {
    const ch = body[i]!;
    if (ch === '\n') {
      flushText();
      tokens.push({ type: 'newline' });
      i += 1;
      continue;
    }
    if (ch === '[') {
      const close = body.indexOf(']', i + 1);
      if (close === -1) {
        textBuf += body.slice(i);
        i = body.length;
        continue;
      }
      flushText();
      tokens.push({ type: 'chord', value: body.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    if (ch === '{') {
      const close = body.indexOf('}', i + 1);
      if (close === -1) {
        textBuf += body.slice(i);
        i = body.length;
        continue;
      }
      flushText();
      tokens.push({ type: 'directive', value: body.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    textBuf += ch;
    i += 1;
  }
  flushText();
  return tokens;
}
```

- [ ] **Step 4: Run, pass, commit** — `feat(chordpro): chord token parser + ChordPro tokenizer`

---

## Phase 3 — ChordPro engine: transpose

### Task 3.1: `transposeChord` and `transposeKey` (TDD with 16 spec cases)

**Files:**
- Create: `src/lib/chordpro/transpose.ts`
- Create: `src/lib/chordpro/__tests__/transpose.test.ts`

- [ ] **Step 1: Write the failing test (the spec's 16 cases verbatim)**

```ts
import { describe, it, expect } from 'vitest';
import { transposeChord, transposeKey, transposeChordPro } from '../transpose';

describe('transposeChord — 16 spec cases', () => {
  it('1. C +2 -> D', () => expect(transposeChord('C', 2)).toBe('D'));
  it('2. Bb +1 -> B', () => expect(transposeChord('Bb', 1)).toBe('B'));
  it('3. B +1 -> C (wrap)', () => expect(transposeChord('B', 1)).toBe('C'));
  it('4. F#m +0 -> F#m', () => expect(transposeChord('F#m', 0)).toBe('F#m'));
  it('5. G/B +5 -> C/E (bass transposes)', () => expect(transposeChord('G/B', 5)).toBe('C/E'));
  it('6. Cmaj7 +3 -> Ebmaj7 (flat default)', () => expect(transposeChord('Cmaj7', 3, 'flat')).toBe('Ebmaj7'));
  it('7. Csus4 -1 -> Bsus4', () => expect(transposeChord('Csus4', -1)).toBe('Bsus4'));
  it('8a. Caug verbatim', () => expect(transposeChord('Caug', 0)).toBe('Caug'));
  it('8b. Cdim7 verbatim', () => expect(transposeChord('Cdim7', 0)).toBe('Cdim7'));
  it('8c. C° verbatim quality', () => expect(transposeChord('C°', 2)).toBe('D°'));
  it('9. [N.C.] passthrough returns input unchanged', () => expect(transposeChord('N.C.', 5)).toBe('N.C.'));
  it('10a. negative wrap -1 from C -> B', () => expect(transposeChord('C', -1)).toBe('B'));
  it('10b. >12 wrap C +13 -> C#', () => expect(transposeChord('C', 13)).toBe('C#'));
  it('10c. <-12 wrap C -13 -> B', () => expect(transposeChord('C', -13)).toBe('B'));
  it('12. F-keyed flat lean: F +1 -> Gb (not F#)', () => expect(transposeChord('F', 1, 'flat')).toBe('Gb'));
});

describe('transposeKey', () => {
  it('G +2 -> A', () => expect(transposeKey('G', 2)).toBe('A'));
  it('F#m +1 -> Gm', () => expect(transposeKey('F#m', 1, 'flat')).toBe('Gm'));
  it('preserves minor flag', () => expect(transposeKey('Em', 5)).toBe('Am'));
});

describe('transposeChordPro', () => {
  it('14. positions preserved', () => {
    expect(transposeChordPro('[G]Amazing[C]grace', 2)).toBe('[A]Amazing[D]grace');
  });
  it('13. directives untouched', () => {
    const body = '{title: Amazing Grace}\n{key: G}\n[G]Amazing [C]grace\n';
    const out = transposeChordPro(body, 2);
    expect(out).toContain('{title: Amazing Grace}');
    expect(out).toContain('{key: G}');
    expect(out).toContain('[A]Amazing [D]grace');
  });
  it('15. empty body handled', () => {
    expect(transposeChordPro('', 5)).toBe('');
  });
  it('16. Tamil lyrics with Latin chords', () => {
    expect(transposeChordPro('[G]அற்புத[C]மான', 2)).toBe('[A]அற்புத[D]மான');
  });
  it('unparseable chord tokens pass through unchanged', () => {
    expect(transposeChordPro('[N.C.]hello[*]world[G]chord', 2)).toBe('[N.C.]hello[*]world[A]chord');
  });
});
```

- [ ] **Step 2: Run, fail** — `pnpm test -t "transposeChord|transposeKey|transposeChordPro"`

- [ ] **Step 3: Implement `transpose.ts`**

```ts
import { type Accidental, normalizeSemitones, rootFromPitchClass, detectKeyAccidental } from './pitch';
import { parseChord, tokenizeChordPro } from './parse';

export function transposeChord(token: string, semitones: number, prefer?: Accidental): string {
  const parsed = parseChord(token);
  if (!parsed) return token;
  const pref = prefer ?? 'sharp';
  const newRootPc = normalizeSemitones(parsed.root + semitones);
  const newRoot = rootFromPitchClass(newRootPc, pref);
  let out = newRoot + parsed.quality;
  if (parsed.bass !== undefined) {
    const newBassPc = normalizeSemitones(parsed.bass + semitones);
    out += '/' + rootFromPitchClass(newBassPc, pref);
  }
  return out;
}

export function transposeKey(originalKey: string, semitones: number, prefer?: Accidental): string {
  const isMinor = originalKey.endsWith('m');
  const rootText = isMinor ? originalKey.slice(0, -1) : originalKey;
  const transposed = transposeChord(rootText, semitones, prefer ?? detectKeyAccidental(originalKey));
  return isMinor ? transposed + 'm' : transposed;
}

export function transposeChordPro(body: string, semitones: number, prefer?: Accidental): string {
  if (!body) return body;
  const tokens = tokenizeChordPro(body);
  const out: string[] = [];
  for (const t of tokens) {
    if (t.type === 'chord') {
      out.push('[' + transposeChord(t.value, semitones, prefer) + ']');
    } else if (t.type === 'directive') {
      out.push('{' + t.value + '}');
    } else if (t.type === 'newline') {
      out.push('\n');
    } else {
      out.push(t.value);
    }
  }
  return out.join('');
}
```

- [ ] **Step 4: Run, pass, commit** — `feat(chordpro): transposeChord/transposeKey/transposeChordPro with 16 spec cases`

### Task 3.2: Property-based tests (fast-check)

**Files:**
- Create: `src/lib/chordpro/__tests__/transpose.property.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { transposeChord } from '../transpose';
import { parseChord } from '../parse';

const chordRoots = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'];
const qualities  = ['','m','m7','maj7','sus4','sus2','dim','dim7','aug','7','9','add9'];

const chordArb = fc.tuple(fc.constantFrom(...chordRoots), fc.constantFrom(...qualities))
  .map(([r, q]) => r + q);
const chordWithBassArb = fc.tuple(chordArb, fc.constantFrom(...chordRoots))
  .map(([c, b]) => c + '/' + b);

describe('transposeChord properties', () => {
  it('round-trip: transpose(transpose(x, n), -n) preserves pitch class', () => {
    fc.assert(
      fc.property(chordArb, fc.integer({ min: -24, max: 24 }), (chord, n) => {
        if (!parseChord(chord)) return true;
        const there = transposeChord(chord, n);
        const back  = transposeChord(there, -n);
        const a = parseChord(chord)!;
        const b = parseChord(back);
        return !!b && a.root === b.root && a.quality === b.quality;
      }),
    );
  });

  it('idempotent at 0', () => {
    fc.assert(fc.property(chordArb, (c) => transposeChord(c, 0) === c));
  });

  it('octave invariance at +/-12 (up to enharmonic spelling)', () => {
    fc.assert(fc.property(chordArb, (c) => {
      const a = parseChord(c);
      if (!a) return true;
      const t = transposeChord(c, 12);
      const p = parseChord(t);
      return !!p && p.root === a.root && p.quality === a.quality;
    }));
  });

  it('bass parallelism: bass transposes the same as root', () => {
    fc.assert(fc.property(chordWithBassArb, fc.integer({ min: -12, max: 12 }), (c, n) => {
      const a = parseChord(c);
      if (!a || a.bass === undefined) return true;
      const t = transposeChord(c, n);
      const p = parseChord(t);
      if (!p || p.bass === undefined) return false;
      return ((p.bass - p.root + 12) % 12) === ((a.bass - a.root + 12) % 12);
    }));
  });
});
```

- [ ] **Step 2: Run, commit** — `test(chordpro): property-based round-trip + invariants via fast-check`

---

## Phase 4 — ChordPro engine: render + index

### Task 4.1: Render to React-friendly blocks

**Files:**
- Create: `src/lib/chordpro/render.ts`
- Create: `src/lib/chordpro/__tests__/render.test.ts`
- Create: `src/lib/chordpro/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderToBlocks } from '../render';

describe('renderToBlocks', () => {
  it('groups by line, splits each line into chord+lyric segments', () => {
    const blocks = renderToBlocks('[G]Amazing [C]grace\n[D]how sweet');
    expect(blocks).toEqual([
      { type: 'line', segments: [
        { chord: 'G', lyric: 'Amazing ' },
        { chord: 'C', lyric: 'grace' },
      ]},
      { type: 'line', segments: [
        { chord: 'D', lyric: 'how sweet' },
      ]},
    ]);
  });
  it('handles lyric-only lines', () => {
    const blocks = renderToBlocks('plain lyric line\n');
    expect(blocks).toEqual([
      { type: 'line', segments: [{ chord: null, lyric: 'plain lyric line' }] },
    ]);
  });
  it('emits directives as their own blocks', () => {
    const blocks = renderToBlocks('{title: A}\n{start_of_chorus}\n[G]Hi');
    const directives = blocks.filter((b) => b.type === 'directive');
    expect(directives).toHaveLength(2);
  });
  it('preserves Tamil text inside lyric segments', () => {
    const blocks = renderToBlocks('[G]அற்புத[C]மான');
    expect(blocks).toEqual([
      { type: 'line', segments: [
        { chord: 'G', lyric: 'அற்புத' },
        { chord: 'C', lyric: 'மான' },
      ]},
    ]);
  });
});
```

- [ ] **Step 2: Implement `render.ts`**

```ts
import { tokenizeChordPro } from './parse';

export type RenderSegment = { chord: string | null; lyric: string };
export type RenderBlock =
  | { type: 'line'; segments: RenderSegment[] }
  | { type: 'directive'; value: string };

export function renderToBlocks(body: string): RenderBlock[] {
  const tokens = tokenizeChordPro(body);
  const out: RenderBlock[] = [];
  let currentSegments: RenderSegment[] = [];
  let pending: RenderSegment | null = null;

  const flushPending = () => {
    if (pending) {
      currentSegments.push(pending);
      pending = null;
    }
  };
  const flushLine = () => {
    flushPending();
    if (currentSegments.length > 0) {
      out.push({ type: 'line', segments: currentSegments });
      currentSegments = [];
    }
  };

  for (const t of tokens) {
    if (t.type === 'directive') {
      flushLine();
      out.push({ type: 'directive', value: t.value });
      continue;
    }
    if (t.type === 'newline') {
      flushLine();
      continue;
    }
    if (t.type === 'chord') {
      flushPending();
      pending = { chord: t.value, lyric: '' };
      continue;
    }
    if (pending) {
      pending.lyric += t.value;
    } else {
      pending = { chord: null, lyric: t.value };
    }
  }
  flushLine();
  return out;
}
```

- [ ] **Step 3: Public `index.ts`**

```ts
export { parseChord, tokenizeChordPro, type ParsedChord, type ChordProToken } from './parse';
export { transposeChord, transposeChordPro, transposeKey } from './transpose';
export { renderToBlocks, type RenderBlock, type RenderSegment } from './render';
export {
  detectKeyAccidental, normalizeSemitones, pitchClassFromRoot, rootFromPitchClass,
  type Accidental, type PitchClass,
} from './pitch';
```

- [ ] **Step 4: Run, commit** — `feat(chordpro): block renderer + public index`

---

## Phase 5 — Songs server actions

### Task 5.1: Schemas + actions

**Files:**
- Create: `src/server/actions/songs.schemas.ts`
- Create: `src/server/actions/songs.ts`
- Create: `src/server/actions/__tests__/songs.test.ts`

- [ ] **Step 1: Schemas** (`src/server/actions/songs.schemas.ts`)

```ts
import { z } from 'zod';

export const songLanguage = z.enum(['de','en','ta']);
export const tagSchema = z.string().trim().min(1).max(40);

export const createSongInput = z.object({
  title: z.string().trim().min(1).max(200),
  language: songLanguage,
  original_key: z.string().regex(/^[A-G](#|b)?m?$/),
  bpm: z.number().int().min(30).max(300).optional(),
  time_signature: z.string().regex(/^\d+\/\d+$/).optional(),
  body_chordpro: z.string().min(1).max(50_000),
  notes: z.string().max(5_000).optional(),
  tags: z.array(tagSchema).max(20).default([]),
});
export type CreateSongInput = z.infer<typeof createSongInput>;

export const updateSongInput = createSongInput.partial();
export type UpdateSongInput = z.infer<typeof updateSongInput>;

export const songIdInput = z.object({ id: z.string().uuid() });
```

- [ ] **Step 2: Failing tests for `createSong` (factory pattern)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/server/auth/errors';
import { makeCreateSong } from '../songs';

const adminSession = {
  user: { id: 'admin-uid' },
  profile: { id: 'admin-uid', display_name: 'A', role: 'admin' as const, created_at: '' },
};

function makeFakes() {
  const inserted: Array<Record<string, unknown>> = [];
  const writeAudit = vi.fn(async () => {});
  const db = {
    insert: vi.fn(async (row: Record<string, unknown>) => { inserted.push(row); return { id: 's1', ...row }; }),
    writeAudit,
  };
  return { db, inserted };
}

describe('createSong', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Forbidden when caller is not admin', async () => {
    const { db } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => { throw new ForbiddenError(); }, db });
    await expect(action({
      title: 't', language: 'en', original_key: 'G', body_chordpro: '[G]hi',
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws Validation on bad key', async () => {
    const { db } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => adminSession, db });
    await expect(action({
      title: 't', language: 'en', original_key: 'INVALID', body_chordpro: '[G]hi',
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts song with created_by + writes audit', async () => {
    const { db, inserted } = makeFakes();
    const action = makeCreateSong({ requireAdmin: async () => adminSession, db });
    const result = await action({
      title: 'Amazing Grace', language: 'en', original_key: 'G',
      body_chordpro: '[G]Amazing', tags: ['hymn'],
    });
    expect(result.id).toBe('s1');
    expect(inserted[0]?.created_by).toBe('admin-uid');
    expect(db.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'song.create', actorId: 'admin-uid', targetId: 's1',
    }));
  });
});
```

- [ ] **Step 3: Implementation** (`src/server/actions/songs.ts`)

```ts
'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ValidationError } from '@/server/auth/errors';
import { requireRole, type Session } from '@/server/auth/require';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSongInput, updateSongInput, songIdInput } from './songs.schemas';

export interface CreateSongDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    insert(row: Record<string, unknown>): Promise<{ id: string } & Record<string, unknown>>;
    writeAudit(input: { actorId: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown> }): Promise<void>;
  };
}

export function makeCreateSong(deps: CreateSongDeps) {
  return async function createSong(rawInput: z.input<typeof createSongInput>): Promise<{ id: string }> {
    const session = await deps.requireAdmin();
    const parsed = createSongInput.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const inserted = await deps.db.insert({
      ...parsed.data,
      created_by: session.profile.id,
      updated_by: session.profile.id,
    });
    await deps.db.writeAudit({
      actorId: session.profile.id,
      action: 'song.create',
      targetType: 'song',
      targetId: inserted.id,
      metadata: { title: parsed.data.title, language: parsed.data.language },
    });
    return { id: inserted.id };
  };
}

const realDeps: CreateSongDeps = {
  requireAdmin: () => requireRole('admin'),
  db: {
    async insert(row) {
      const sb = await createSupabaseServerClient();
      const { data, error } = await sb.from('songs').insert(row).select('id').single();
      if (error || !data) throw new Error(error?.message ?? 'insert failed');
      return data as { id: string };
    },
    async writeAudit({ actorId, action, targetType, targetId, metadata }) {
      const sb = createSupabaseAdminClient();
      const { error } = await sb.rpc('write_audit', {
        p_actor: actorId, p_action: action, p_target_type: targetType, p_target_id: targetId, p_metadata: metadata,
      });
      if (error) throw new Error(error.message);
    },
  },
};

export const createSong = makeCreateSong(realDeps);

export async function updateSong(id: string, rawInput: z.input<typeof updateSongInput>) {
  const session = await requireRole('admin');
  const parsedId = songIdInput.safeParse({ id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());
  const parsed = updateSongInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = await createSupabaseServerClient();
  const { error } = await sb
    .from('songs')
    .update({ ...parsed.data, updated_by: session.profile.id })
    .eq('id', id);
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id, p_action: 'song.update', p_target_type: 'song', p_target_id: id, p_metadata: {},
  });

  revalidatePath('/songs');
  revalidatePath(`/songs/${id}`);
}

export async function deleteSong(id: string) {
  const session = await requireRole('admin');
  const parsedId = songIdInput.safeParse({ id });
  if (!parsedId.success) throw new ValidationError(parsedId.error.flatten());

  const sb = await createSupabaseServerClient();
  const { error } = await sb.from('songs').delete().eq('id', id);
  if (error) throw new Error(error.message);

  const sbAdmin = createSupabaseAdminClient();
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id, p_action: 'song.delete', p_target_type: 'song', p_target_id: id, p_metadata: {},
  });

  revalidatePath('/songs');
}

export async function listSongs() {
  await requireRole('admin', 'leader', 'musician');
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from('songs')
    .select('id, title, language, original_key, bpm, tags, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSong(id: string) {
  await requireRole('admin', 'leader', 'musician');
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from('songs').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data;
}
```

- [ ] **Step 4: Run, commit** — `feat(songs): server actions for create/update/delete/list/get + zod schemas`

---

## Phase 6 — Themes + fonts

### Task 6.1: next/font setup with Noto Sans + Noto Sans Tamil

**Files:**
- Create: `src/app/fonts.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Configure fonts**

```ts
import { Inter, Noto_Sans, Noto_Sans_Tamil } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

export const notoSans = Noto_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sans',
  display: 'swap',
});

export const notoSansTamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sans-tamil',
  display: 'swap',
});
```

- [ ] **Step 2: Apply variables in root layout** — set `className={fontVars}` on `<html>` where `fontVars = ${inter.variable} ${notoSans.variable} ${notoSansTamil.variable}`.

- [ ] **Step 3: Commit** — `feat(ui): next/font for Inter + Noto Sans + Noto Sans Tamil`

### Task 6.2: Stage-dark theme + lang-aware font binding

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Append `.stage-dark` block + lang selectors**

```css
@layer base {
  .stage-dark {
    --color-bg:        oklch(0% 0 0);
    --color-fg:        oklch(95% 0 0);
    --color-muted:     oklch(8% 0 0);
    --color-muted-fg:  oklch(70% 0 0);
    --color-border:    oklch(20% 0 0);
    --color-accent:    oklch(78% 0.16 60);
    --color-accent-fg: oklch(0% 0 0);
    --color-danger:    oklch(75% 0.22 25);
  }
  body {
    font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  }
  [lang="ta"], .lang-ta {
    font-family: var(--font-noto-sans-tamil), var(--font-noto-sans), ui-sans-serif, sans-serif;
  }
  .lyric {
    font-family: var(--font-noto-sans), ui-sans-serif, sans-serif;
  }
}
```

- [ ] **Step 2: Commit** — `feat(ui): stage-dark theme + lang-aware font binding`

### Task 6.3: ThemeProvider client island

**Files:**
- Create: `src/components/theme/ThemeProvider.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: ThemeProvider**

```tsx
'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'stage-dark';
const STORAGE_KEY = 'songdrop-theme';

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    const stored = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as Theme | null;
    if (stored === 'light' || stored === 'dark' || stored === 'stage-dark') setTheme(stored);
  }, []);
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'stage-dark');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else if (theme === 'stage-dark') document.documentElement.classList.add('stage-dark');
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);
  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
```

- [ ] **Step 2: Wrap app layout** — `src/app/(app)/layout.tsx` returns `<ThemeProvider><AppShell ...>{children}</AppShell></ThemeProvider>`.

- [ ] **Step 3: Commit** — `feat(ui): theme provider with light/dark/stage-dark and localStorage`

---

## Phase 7 — Song viewer

### Task 7.1: ChordBlock + SongViewer

**Files:**
- Create: `src/components/viewer/ChordLine.tsx`
- Create: `src/components/viewer/SongViewer.tsx`

- [ ] **Step 1: ChordBlock** (`src/components/viewer/ChordLine.tsx`) renders one block as chord-above-lyric using the engine's `RenderBlock` shape. Apply `lang={language}` for Tamil binding. Use absolutely-positioned chord text above each segment's lyric.

- [ ] **Step 2: SongViewer** (`src/components/viewer/SongViewer.tsx`) is a `'use client'` component with:
  - State: `semitones`, `fontStep` (0..4 mapped to 16/20/24/30/40 px), `autoScroll`, `theme` from `useTheme()`.
  - Memoized: `transposeChordPro(body, semitones, accidental)` → `renderToBlocks(...)` → list of `ChordBlock`.
  - Header (sticky, backdrop-blur): title, original key, computed-key chip, BPM, time-sig, transpose −/+ buttons, font/theme/autoscroll/fullscreen buttons.
  - Persists `fontStep` to `localStorage` (`songdrop-font-step`).
  - Autoscroll: `requestAnimationFrame` loop scrolling the `window` at `(bpm/200)` px per frame; click-anywhere stops it.
  - Fullscreen: native `requestFullscreen()` / `exitFullscreen()` on the article ref.

(Full code follows the structure in the spec; the agent implementing this task should match the API: button labels, aria-labels, the FONT_STEPS array, and the `Theme` cycle.)

- [ ] **Step 3: Commit** — `feat(viewer): SongViewer with transpose/font/theme/autoscroll/fullscreen`

### Task 7.2: Songs list and viewer pages

**Files:**
- Create: `src/app/(app)/songs/page.tsx`
- Create: `src/app/(app)/songs/[id]/page.tsx`

- [ ] **Step 1: List page** — calls `listSongs()`, renders rows with title (`lang={s.language}`), language code, key, BPM. "+ New song" button visible only to admins.

- [ ] **Step 2: Viewer page** — `params: Promise<{ id: string }>`, awaits, calls `getSong(id)`, returns `<SongViewer song={song} />` or `notFound()`.

- [ ] **Step 3: Commit** — `feat(songs): list page + viewer page`

---

## Phase 8 — Song editor

### Task 8.1: SongEditor + new/edit pages

**Files:**
- Create: `src/components/editor/SongEditor.tsx`
- Create: `src/app/(app)/songs/new/page.tsx`
- Create: `src/app/(app)/songs/[id]/edit/page.tsx`

- [ ] **Step 1: SongEditor** — `'use client'` component with:
  - Form fields: title, original_key (pattern attribute), language `<select>`, bpm, time_signature, tags (CSV input).
  - Split body pane (textarea on left, live preview on right via `renderToBlocks(body)` rendered with `ChordBlock`).
  - Live validation: reuse `parseChord` on each chord token; show unparseable tokens in a red sidebar list.
  - Submit handler accepts a `(form: FormData) => Promise<void>` action prop.
  - `useTransition` for pending state on the submit button.

- [ ] **Step 2: New page** — admin-gated. Inline `'use server'` action wraps `createSong` in `runAction(...)`. On success redirect to the new song's viewer; on failure redirect to `/songs/new?error=<code>`.

- [ ] **Step 3: Edit page** — admin-gated. Loads the song, passes initial values to `SongEditor`. Inline action wraps `updateSong`.

- [ ] **Step 4: Commit** — `feat(editor): split-pane song editor + new/edit pages`

---

## Phase 9 — Songs RLS integration tests

### Task 9.1: Songs RLS matrix

**Files:**
- Create: `tests/rls/songs.test.ts`

- [ ] **Step 1: Tests**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, makeUser, cleanup } from './helpers';

let adminUser: Awaited<ReturnType<typeof makeUser>>;
let leader: Awaited<ReturnType<typeof makeUser>>;
let musician: Awaited<ReturnType<typeof makeUser>>;
let songId: string;

beforeAll(async () => {
  adminUser = await makeUser('admin');
  leader = await makeUser('leader');
  musician = await makeUser('musician');

  const a = admin();
  const { data, error } = await a.from('songs').insert({
    title: 'RLS Test Song', language: 'en', original_key: 'G',
    body_chordpro: '[G]Hi', created_by: adminUser.id,
  }).select('id').single();
  if (error || !data) throw error;
  songId = data.id;
});
afterAll(async () => {
  const a = admin();
  await a.from('songs').delete().eq('id', songId);
  await cleanup([adminUser.id, leader.id, musician.id]);
});

describe('songs RLS', () => {
  it('musician can read', async () => {
    const { data } = await musician.sb.from('songs').select('id').eq('id', songId);
    expect(data ?? []).toHaveLength(1);
  });
  it('leader can read', async () => {
    const { data } = await leader.sb.from('songs').select('id').eq('id', songId);
    expect(data ?? []).toHaveLength(1);
  });
  it('admin can read', async () => {
    const { data } = await adminUser.sb.from('songs').select('id').eq('id', songId);
    expect(data ?? []).toHaveLength(1);
  });
  it('musician cannot insert', async () => {
    const { error } = await musician.sb.from('songs').insert({
      title: 'denied', language: 'en', original_key: 'G', body_chordpro: '[G]', created_by: musician.id,
    });
    expect(error).not.toBeNull();
  });
  it('leader cannot insert', async () => {
    const { error } = await leader.sb.from('songs').insert({
      title: 'denied', language: 'en', original_key: 'G', body_chordpro: '[G]', created_by: leader.id,
    });
    expect(error).not.toBeNull();
  });
  it('admin can update', async () => {
    const { error } = await adminUser.sb.from('songs').update({ title: 'updated' }).eq('id', songId);
    expect(error).toBeNull();
  });
  it('leader cannot update', async () => {
    const { error } = await leader.sb.from('songs').update({ title: 'denied' }).eq('id', songId);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Commit** — `test(rls): songs policy matrix`

---

## Phase 10 — Multilingual seed + screenshot E2E

### Task 10.1: Extend `scripts/seed.ts` with the 6 hymns

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Append 6 seed-songs** — after the admin upsert block, iterate over the array below and idempotently insert (skip if a song with the same title already exists):

```ts
const seedSongs = [
  {
    title: 'Amazing Grace', language: 'en', original_key: 'G', bpm: 80, time_signature: '4/4',
    tags: ['hymn','classic','grace'],
    body_chordpro: `{title: Amazing Grace}\n{key: G}\n{start_of_verse}\n[G]Amazing [C]grace, how [G]sweet the sound\n[G]That [G/B]saved a [C]wretch like [D]me\n{end_of_verse}\n`,
  },
  {
    title: 'Be Thou My Vision', language: 'en', original_key: 'Eb', bpm: 90, time_signature: '3/4',
    tags: ['hymn','irish','worship'],
    body_chordpro: `{title: Be Thou My Vision}\n{key: Eb}\n[Eb]Be thou my [Ab]vision, O [Eb]Lord of my [Bb]heart\n[Eb]Naught be all [Ab]else to [Cm]me, save that [Bb]Thou [Eb]art\n`,
  },
  {
    title: 'Großer Gott, wir loben dich', language: 'de', original_key: 'D', bpm: 100, time_signature: '4/4',
    tags: ['hymn','klassisch','lob'],
    body_chordpro: `{title: Großer Gott, wir loben dich}\n{key: D}\n[D]Großer [G]Gott, wir [D]loben dich\n[D]Herr, wir [G]preisen [A]deine [D]Stärke\n`,
  },
  {
    title: 'Lobe den Herren, den mächtigen König', language: 'de', original_key: 'F', bpm: 110, time_signature: '3/4',
    tags: ['hymn','klassisch'],
    body_chordpro: `{title: Lobe den Herren}\n{key: F}\n[F]Lobe den [Bb]Herren, den [F]mächtigen [C]König der [F]Ehren\n[F]Meine ge[Bb]liebete [Gm]Seele, das [C]ist mein Be[F]gehren\n`,
  },
  {
    title: 'அற்புதமான இரட்சகர்', language: 'ta', original_key: 'G', bpm: 75, time_signature: '4/4',
    tags: ['தமிழ்','ஆராதனை'],
    body_chordpro: `{title: அற்புதமான இரட்சகர்}\n{key: G}\n[G]அற்புத[C]மான [G]இரட்சகர்\n[G]யேசு [D]என் [C]நாதர் [G]நீரே\n`,
  },
  {
    title: 'யேசு என் ஆனந்தம்', language: 'ta', original_key: 'D', bpm: 90, time_signature: '6/8',
    tags: ['தமிழ்','துதி'],
    body_chordpro: `{title: யேசு என் ஆனந்தம்}\n{key: D}\n[D]யேசு [G]என் [D]ஆனந்தம்\n[D]நீரே [A]என் [G]சந்தோ[D]ஷம்\n`,
  },
];

for (const song of seedSongs) {
  const { data: existing } = await sb
    .from('songs').select('id').eq('title', song.title).maybeSingle();
  if (existing) {
    console.log(`Song already exists: ${song.title}`);
    continue;
  }
  const { error } = await sb.from('songs').insert({ ...song, created_by: userId });
  if (error) throw error;
  console.log(`Seeded song: ${song.title}`);
}
```

- [ ] **Step 2: Commit** — `feat(seed): 6 multilingual hymns (DE/EN/TA) for dev`

### Task 10.2: Tamil rendering screenshot E2E

**Files:**
- Create: `e2e/multilingual.spec.ts`

- [ ] **Step 1: Test** (mirrors the auth pattern from Plan A's E2E):

```ts
import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@nlc-burgdorf.local';
const ADMIN_PASSWORD = process.env.SEED_PASSWORD ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

test.skip(!ADMIN_PASSWORD || !SUPABASE_URL || !SUPABASE_ANON, 'Required env not set.');

async function authCookies(request: APIRequestContext) {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!res.ok()) throw new Error(`signin failed: ${res.status()}`);
  return res.json();
}

test('Tamil song renders correctly with Noto Sans Tamil', async ({ page, context, request }) => {
  const tokens = await authCookies(request);
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0] ?? 'project';
  const baseURL = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  const host = new URL(baseURL).hostname;
  await context.addCookies([{
    name: `sb-${projectRef}-auth-token`,
    value: encodeURIComponent(JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })),
    domain: host, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
  }]);

  await page.goto('/songs');
  await page.getByRole('link', { name: /அற்புதமான/ }).click();
  await page.waitForLoadState('networkidle');
  const lyricRegion = page.locator('article section').first();
  await expect(lyricRegion).toHaveScreenshot('tamil-song-lyrics.png', { maxDiffPixelRatio: 0.02 });
});
```

(First run creates the baseline; subsequent runs diff it. The 2% pixel-ratio tolerance handles tiny font-render differences across CI machines.)

- [ ] **Step 2: Commit** — `test(e2e): Tamil song screenshot diff for font regression`

---

## Phase 11 — Final smoke

### Task 11.1: Local quality bar (Docker-free)

- [ ] Run all five locally:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm scan-bundle`

All must be green.

### Task 11.2: Docker-gated steps (run once Docker is installed)

- [ ] `pnpm db:reset` applies all 7 migrations cleanly.
- [ ] `pnpm db:seed` creates the admin and the 6 hymns.
- [ ] `pnpm test:rls` — Plan A's 9 profile tests + Plan B's 7 song tests = 16 RLS tests pass.
- [ ] `pnpm test:e2e` — auth-flow + multilingual screenshot tests pass.

### Task 11.3: Manual demo

- [ ] Start dev server, walk through:
  1. Sign in as admin.
  2. `/songs` lists 6 hymns.
  3. Open Amazing Grace → chords above lyrics.
  4. `+` chip twice → key updates to `A`. Chord row updates.
  5. Cycle theme → light → dark → stage-dark. Chords go amber.
  6. Font toggle → text grows. Persists across reload.
  7. Autoscroll toggle → page scrolls slowly. Tap to stop.
  8. Fullscreen → enters/exits cleanly.
  9. Open `அற்புதமான இரட்சகர்` → Tamil renders cleanly.
  10. `+ New song` (admin only) → editor opens. Live preview updates as you type. Save → redirects to viewer.
  11. As musician (re-seed or DB-edit role), confirm `+ New song` is hidden and `/songs/new` redirects.

---

## Self-review checklist

- [ ] **Spec coverage:**
  - Songs: model + RLS + actions + viewer + editor.
  - ChordPro engine: parse, transpose (16 spec cases + property tests), render.
  - Themes: light/dark/stage-dark with persistence.
  - Multilingual: DE/EN/TA via Noto Sans + Noto Sans Tamil.
  - Seed: 6 hymns covering all three languages.
  - Plan A follow-ups (CSP, brute-force, accept DoS, dedup, error mapping) all closed.
- [ ] No placeholders. Every step has actual content.
- [ ] Type consistency: `Theme`, `RenderBlock`, `ParsedChord`, song shape used consistently.
- [ ] Each TDD task has the 5-step rhythm (test → fail → impl → pass → commit).
- [ ] Quality bar green at the end of every phase.
- [ ] Conventional-commit messages with the `Co-Authored-By` footer.

---

## What Plan C will pick up

- `playlists`, `playlist_items`, `playlist_versions` tables + RLS.
- Playlist server actions (create, add/remove/reorder, transpose-per-song, save version).
- Playlist builder UI + drag-reorder.
- Playlist performance mode (fullscreen swipe between songs, Bluetooth pedal arrow keys).
- Share-to-band server action with SMTP fan-out + audit row.
- `recordOpen` audit fire-and-forget.
- Final E2E for the playlist + share happy path.
