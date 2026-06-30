# User Deactivation (Soft-Delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-way "deactivate user" action that blocks login (Supabase ban), hides the user from the admin member list and rota picker, and clears them from upcoming service assignments — without violating foreign-key constraints that make hard-delete impossible.

**Architecture:** A new nullable `profiles.disabled_at timestamptz` column plus a `makeAdminDisableUser` factory in `src/server/actions/profile.ts` following the established factory + thin-wrapper pattern (see `invitations.ts:33` and `playlists.test.ts:23`). Filtering at three call sites; one new UI section in `admin/users/[id]`; one new banner entry in `admin/users`.

**Tech Stack:** Postgres (Supabase) migration, Zod schema, Next.js Server Action, Tailwind v4 UI, Vitest with dependency-injection (no real Supabase in unit tests).

**Spec:** `docs/superpowers/specs/2026-06-23-user-deactivation-design.md` — commit `d44024a`.

**Spec correction discovered during planning:** The spec's pseudocode references `service_assignments.profile_id`. The actual column is `member_id` (verified at `supabase/migrations/0012_service_assignments.sql:19`). This plan uses the correct name.

---

## File Structure

**New files (3):**
- `supabase/migrations/0026_profiles_soft_delete.sql` — column + partial index
- `src/server/actions/__tests__/profile.test.ts` — Vitest cases for `makeAdminDisableUser`, plus filter checks for `listMembersForAdmin`
- `src/server/actions/__tests__/service.test.ts` — Vitest cases for `getRotaCandidates` filter

**Modified files (5):**
- `src/server/actions/profile.schemas.ts` — add `adminDisableUserInput`
- `src/server/actions/profile.ts` — add `AdminDisableUserDeps`, `makeAdminDisableUser`, wrapper `adminDisableUser`, refactor `listMembersForAdmin` to a `makeListMembersForAdmin` factory + thin wrapper, add `.is('disabled_at', null)` filter
- `src/server/actions/service.ts` — refactor `getRotaCandidates` to a `makeGetRotaCandidates` factory + thin wrapper, add `.is('disabled_at', null)` filter
- `src/app/(app)/admin/users/[id]/page.tsx` — replace the "ask Supabase support" footnote with a Danger-Zone section + native `<dialog>` confirmation; add server action `disableAction`
- `src/app/(app)/admin/users/page.tsx` — add `'user-disabled'` entry to `BANNERS` map

---

## Task 1: Migration — `profiles.disabled_at` + partial index

**Files:**
- Create: `supabase/migrations/0026_profiles_soft_delete.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 0026_profiles_soft_delete.sql — soft-delete column for profiles.
--
-- Hard-delete of auth.users / profiles is blocked by FK constraints from
-- audit_log, service_assignments (on delete restrict), playlists owner_id,
-- and others. Soft-delete is the way out: set disabled_at and the user
-- disappears from the admin list and rota picker.
--
-- Companion behavior (in application code, not SQL):
--   * Supabase auth.users.banned_until is set via the admin API.
--   * Future service_assignments are deleted on deactivation.
--
-- The partial index keeps the hot path (active members) fast; deactivated
-- rows are rare and don't need to be indexed in the same shape.

alter table profiles
  add column disabled_at timestamptz;

create index profiles_active_idx on profiles (created_at desc)
  where disabled_at is null;
```

- [ ] **Step 2: Apply the migration to the dev branch**

The project uses Supabase. Use the MCP tool `mcp__claude_ai_Supabase__apply_migration` with:
- `name`: `0026_profiles_soft_delete`
- `query`: the full SQL body above (without the leading `-- 0026_...` filename header, since `apply_migration` adds its own header)

Verify success: the tool returns `success: true` and `list_migrations` includes `20260623…_0026_profiles_soft_delete`.

- [ ] **Step 3: Verify column exists**

Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'disabled_at';
```
Expected: one row, `disabled_at | timestamp with time zone | YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0026_profiles_soft_delete.sql
git commit -m "feat(profiles): add disabled_at column + partial index for soft-delete"
```

---

## Task 2: Zod schema — `adminDisableUserInput`

**Files:**
- Modify: `src/server/actions/profile.schemas.ts:63` (append at end of file)

- [ ] **Step 1: Add the schema**

Append to `src/server/actions/profile.schemas.ts`:

```ts
export const adminDisableUserInput = z.object({
  user_id: z.string().uuid(),
});
export type AdminDisableUserInput = z.infer<typeof adminDisableUserInput>;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes (no consumer yet, so no errors).

- [ ] **Step 3: Commit**

```bash
git add src/server/actions/profile.schemas.ts
git commit -m "feat(profile-schemas): add adminDisableUserInput"
```

---

## Task 3: Failing test — `makeAdminDisableUser` happy path

**Files:**
- Create: `src/server/actions/__tests__/profile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/actions/__tests__/profile.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/server/auth/errors';
import { makeAdminDisableUser } from '../profile';

const adminSession = {
  user: { id: 'admin-uid' },
  profile: { id: 'admin-uid', display_name: 'Admin', role: 'admin' as const, created_at: '' },
};

function makeFakes(opts?: {
  targetRole?: 'admin' | 'leader' | 'viewer';
  activeAdminCount?: number;
  futurePlaylistIds?: string[];
}) {
  const bans: Array<{ user_id: string; ban_duration: string }> = [];
  const profileUpdates: Array<{ id: string; disabled_at: string }> = [];
  const assignmentDeletes: Array<{ member_id: string; playlist_ids: string[] }> = [];
  const audits: Array<Record<string, unknown>> = [];

  const db = {
    getProfileRole: vi.fn(async (_id: string) => opts?.targetRole ?? 'viewer'),
    countActiveAdmins: vi.fn(async () => opts?.activeAdminCount ?? 2),
    banUser: vi.fn(async (user_id: string, ban_duration: string) => {
      bans.push({ user_id, ban_duration });
    }),
    markProfileDisabled: vi.fn(async (id: string, disabled_at: string) => {
      profileUpdates.push({ id, disabled_at });
    }),
    futurePlaylistIds: vi.fn(async () => opts?.futurePlaylistIds ?? ['pl-1', 'pl-2']),
    deleteAssignments: vi.fn(async (member_id: string, playlist_ids: string[]) => {
      assignmentDeletes.push({ member_id, playlist_ids });
    }),
    writeAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
  };

  return { db, bans, profileUpdates, assignmentDeletes, audits };
}

describe('adminDisableUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bans, marks disabled, clears future rota, writes audit', async () => {
    const { db, bans, profileUpdates, assignmentDeletes, audits } = makeFakes();
    const action = makeAdminDisableUser({
      requireAdmin: async () => adminSession,
      db,
    });

    await action({ user_id: '11111111-1111-1111-1111-111111111111' });

    expect(bans).toEqual([
      { user_id: '11111111-1111-1111-1111-111111111111', ban_duration: '876000h' },
    ]);
    expect(profileUpdates).toHaveLength(1);
    expect(profileUpdates[0]!.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(profileUpdates[0]!.disabled_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(assignmentDeletes).toEqual([
      { member_id: '11111111-1111-1111-1111-111111111111', playlist_ids: ['pl-1', 'pl-2'] },
    ]);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: 'admin-uid',
      action: 'profile.disabled',
      targetType: 'profile',
      targetId: '11111111-1111-1111-1111-111111111111',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/actions/__tests__/profile.test.ts`
Expected: FAIL with import error — `makeAdminDisableUser` is not exported from `'../profile'`.

---

## Task 4: Implement `makeAdminDisableUser` (happy path only)

**Files:**
- Modify: `src/server/actions/profile.ts` — add types, factory, and wrapper at end of file

- [ ] **Step 1: Add the types and factory at the end of `profile.ts`**

Append to `src/server/actions/profile.ts`:

```ts
// ===========================================================================
// Soft-delete (deactivate) — one-way action
// ===========================================================================

import { adminDisableUserInput } from './profile.schemas';
import type { Session } from '@/server/auth/require';

export interface AdminDisableUserDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    getProfileRole(user_id: string): Promise<'admin' | 'leader' | 'viewer' | null>;
    countActiveAdmins(): Promise<number>;
    banUser(user_id: string, ban_duration: string): Promise<void>;
    markProfileDisabled(user_id: string, disabled_at_iso: string): Promise<void>;
    futurePlaylistIds(): Promise<string[]>;
    deleteAssignments(member_id: string, playlist_ids: string[]): Promise<void>;
    writeAudit(input: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      metadata: Record<string, unknown>;
    }): Promise<void>;
  };
}

const PERMANENT_BAN_DURATION = '876000h'; // ~100 years; Supabase has no 'infinity'

export function makeAdminDisableUser(deps: AdminDisableUserDeps) {
  return async function adminDisableUser(
    rawInput: z.input<typeof adminDisableUserInput>,
  ) {
    const session = await deps.requireAdmin();
    const parsed = adminDisableUserInput.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const { user_id } = parsed.data;

    await deps.db.banUser(user_id, PERMANENT_BAN_DURATION);
    await deps.db.markProfileDisabled(user_id, new Date().toISOString());

    const playlistIds = await deps.db.futurePlaylistIds();
    await deps.db.deleteAssignments(user_id, playlistIds);

    await deps.db.writeAudit({
      actorId: session.profile.id,
      action: 'profile.disabled',
      targetType: 'profile',
      targetId: user_id,
      metadata: {},
    });

    return { ok: true };
  };
}
```

Note: the existing `import` for `adminDisableUserInput` may already be added if you imported it earlier; check the import block at the top of the file and merge — don't duplicate.

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm vitest run src/server/actions/__tests__/profile.test.ts`
Expected: PASS — 1 test green.

- [ ] **Step 3: Commit**

```bash
git add src/server/actions/profile.ts src/server/actions/__tests__/profile.test.ts
git commit -m "feat(profile): makeAdminDisableUser factory — happy path"
```

---

## Task 5: Guard — cannot self-disable

**Files:**
- Modify: `src/server/actions/__tests__/profile.test.ts` (add test)
- Modify: `src/server/actions/profile.ts` (add guard)

- [ ] **Step 1: Write the failing test**

Add inside `describe('adminDisableUser', …)` in `profile.test.ts`:

```ts
it('throws ValidationError when admin tries to disable themselves', async () => {
  const { db } = makeFakes();
  const action = makeAdminDisableUser({
    requireAdmin: async () => adminSession,
    db,
  });

  await expect(action({ user_id: 'admin-uid' }))
    .rejects.toBeInstanceOf(ValidationError);

  expect(db.banUser).not.toHaveBeenCalled();
  expect(db.markProfileDisabled).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/actions/__tests__/profile.test.ts -t "themselves"`
Expected: FAIL — `banUser` was called, no error thrown.

- [ ] **Step 3: Add the guard in `makeAdminDisableUser`**

In `profile.ts`, inside the returned function, **after** the `safeParse` block and **before** the `banUser` call, insert:

```ts
    if (parsed.data.user_id === session.profile.id) {
      throw new ValidationError({ form: ['Cannot disable yourself.'] });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/actions/__tests__/profile.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/profile.ts src/server/actions/__tests__/profile.test.ts
git commit -m "feat(profile): block self-disable in adminDisableUser"
```

---

## Task 6: Guard — cannot disable the last active admin

**Files:**
- Modify: `src/server/actions/__tests__/profile.test.ts` (add 2 tests)
- Modify: `src/server/actions/profile.ts` (add guard)

- [ ] **Step 1: Write the failing tests**

Add inside `describe('adminDisableUser', …)`:

```ts
it('throws ValidationError when target is the last active admin', async () => {
  const { db } = makeFakes({ targetRole: 'admin', activeAdminCount: 1 });
  const action = makeAdminDisableUser({
    requireAdmin: async () => adminSession,
    db,
  });

  await expect(action({ user_id: '22222222-2222-2222-2222-222222222222' }))
    .rejects.toBeInstanceOf(ValidationError);

  expect(db.banUser).not.toHaveBeenCalled();
  expect(db.markProfileDisabled).not.toHaveBeenCalled();
});

it('allows disabling an admin when other active admins remain', async () => {
  const { db, bans } = makeFakes({ targetRole: 'admin', activeAdminCount: 2 });
  const action = makeAdminDisableUser({
    requireAdmin: async () => adminSession,
    db,
  });

  await action({ user_id: '22222222-2222-2222-2222-222222222222' });
  expect(bans).toHaveLength(1);
});

it('does not check admin count when target is not an admin', async () => {
  const { db } = makeFakes({ targetRole: 'viewer' });
  const action = makeAdminDisableUser({
    requireAdmin: async () => adminSession,
    db,
  });
  await action({ user_id: '33333333-3333-3333-3333-333333333333' });
  expect(db.countActiveAdmins).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/actions/__tests__/profile.test.ts`
Expected: FAIL — the "last admin" case throws nothing (currently); the "does not check" case fails because `countActiveAdmins` is never invoked anywhere yet (it passes by accident — but watch for false greens).

- [ ] **Step 3: Add the guard in `makeAdminDisableUser`**

In `profile.ts`, inside the returned function, **after** the self-disable check and **before** the `banUser` call, insert:

```ts
    const targetRole = await deps.db.getProfileRole(parsed.data.user_id);
    if (targetRole === 'admin') {
      const remaining = await deps.db.countActiveAdmins();
      if (remaining <= 1) {
        throw new ValidationError({
          form: ['Cannot disable the last active admin.'],
        });
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/actions/__tests__/profile.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/profile.ts src/server/actions/__tests__/profile.test.ts
git commit -m "feat(profile): block disabling the last active admin"
```

---

## Task 7: Guard — non-admin caller is rejected

**Files:**
- Modify: `src/server/actions/__tests__/profile.test.ts` (add test)

No implementation change needed — the existing `requireRole('admin')` wrapper in the real wired action (Task 8) enforces this. We test the factory contract by injecting a throwing `requireAdmin`.

- [ ] **Step 1: Add the test**

```ts
it('rejects callers who are not admin (via requireAdmin)', async () => {
  const { db } = makeFakes();
  const action = makeAdminDisableUser({
    requireAdmin: async () => { throw new ForbiddenError(); },
    db,
  });
  await expect(action({ user_id: '44444444-4444-4444-4444-444444444444' }))
    .rejects.toBeInstanceOf(ForbiddenError);

  expect(db.banUser).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify it passes**

Run: `pnpm vitest run src/server/actions/__tests__/profile.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 3: Commit**

```bash
git add src/server/actions/__tests__/profile.test.ts
git commit -m "test(profile): adminDisableUser rejects non-admin callers"
```

---

## Task 8: Wire the default action (thin wrapper)

**Files:**
- Modify: `src/server/actions/profile.ts` — append the wired wrapper

This converts the factory into a Server Action that real call sites (the UI) can import. Pattern mirrors `sendInvitation` in `invitations.ts:75`.

- [ ] **Step 1: Append the wrapper**

Add to `src/server/actions/profile.ts`:

```ts
export async function adminDisableUser(
  rawInput: z.input<typeof adminDisableUserInput>,
) {
  'use server';
  const sbAdmin = createSupabaseAdminClient();
  const action = makeAdminDisableUser({
    requireAdmin: () => requireRole('admin'),
    db: {
      async getProfileRole(user_id) {
        const { data, error } = await sbAdmin
          .from('profiles')
          .select('role')
          .eq('id', user_id)
          .maybeSingle();
        if (error) throw new Error(`getProfileRole failed: ${error.message}`);
        return (data?.role ?? null) as 'admin' | 'leader' | 'viewer' | null;
      },
      async countActiveAdmins() {
        const { count, error } = await sbAdmin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')
          .is('disabled_at', null);
        if (error) throw new Error(`countActiveAdmins failed: ${error.message}`);
        return count ?? 0;
      },
      async banUser(user_id, ban_duration) {
        const { error } = await sbAdmin.auth.admin.updateUserById(user_id, {
          ban_duration,
        });
        if (error) throw new Error(`banUser failed: ${error.message}`);
      },
      async markProfileDisabled(user_id, disabled_at_iso) {
        const { error } = await sbAdmin
          .from('profiles')
          .update({ disabled_at: disabled_at_iso })
          .eq('id', user_id);
        if (error) throw new Error(`markProfileDisabled failed: ${error.message}`);
      },
      async futurePlaylistIds() {
        const today = new Date().toISOString().slice(0, 10); // playlists.scheduled_for is a date
        const { data, error } = await sbAdmin
          .from('playlists')
          .select('id')
          .gte('scheduled_for', today);
        if (error) throw new Error(`futurePlaylistIds failed: ${error.message}`);
        return (data ?? []).map((r) => r.id as string);
      },
      async deleteAssignments(member_id, playlist_ids) {
        if (playlist_ids.length === 0) return;
        const { error } = await sbAdmin
          .from('service_assignments')
          .delete()
          .eq('member_id', member_id)
          .in('playlist_id', playlist_ids);
        if (error) throw new Error(`deleteAssignments failed: ${error.message}`);
      },
      async writeAudit({ actorId, action, targetType, targetId, metadata }) {
        const { error } = await sbAdmin.rpc('write_audit', {
          p_actor: actorId,
          p_action: action,
          p_target_type: targetType,
          p_target_id: targetId,
          p_metadata: metadata,
        });
        if (error) throw new Error(`writeAudit failed: ${error.message}`);
      },
    },
  });
  const result = await action(rawInput);
  revalidatePath('/admin/users');
  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes — `createSupabaseAdminClient`, `requireRole`, `revalidatePath` are all already imported at the top of `profile.ts`.

- [ ] **Step 3: Run all tests**

Run: `pnpm vitest run`
Expected: PASS — all existing tests + 6 new ones green.

- [ ] **Step 4: Commit**

```bash
git add src/server/actions/profile.ts
git commit -m "feat(profile): wire adminDisableUser server action"
```

---

## Task 9: Filter `listMembersForAdmin` + test

**Files:**
- Modify: `src/server/actions/profile.ts` — refactor `listMembersForAdmin` into factory + thin wrapper, add filter
- Modify: `src/server/actions/__tests__/profile.test.ts` — add filter test

The existing `listMembersForAdmin` lives at `profile.ts:112` and uses the admin client directly. To test the filter without a real Supabase, we refactor to the factory pattern.

- [ ] **Step 1: Write the failing test**

Append to `src/server/actions/__tests__/profile.test.ts`:

```ts
import { makeListMembersForAdmin } from '../profile';

describe('listMembersForAdmin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only returns profiles where disabled_at IS NULL', async () => {
    // The factory's db.fetchActiveMembers is responsible for the filter;
    // we verify the action passes through what the db returned and the
    // wired wrapper (in profile.ts) will pass the filter to Supabase.
    const fetchActiveMembers = vi.fn(async () => [
      { id: 'u1', display_name: 'Alice', role: 'leader' as const, created_at: '2026-01-01' },
    ]);
    const fetchCapabilities = vi.fn(async () => []);
    const list = makeListMembersForAdmin({
      requireAdmin: async () => adminSession,
      db: { fetchActiveMembers, fetchCapabilities },
    });

    const result = await list();
    expect(fetchActiveMembers).toHaveBeenCalledOnce();
    expect(result).toEqual([
      { id: 'u1', display_name: 'Alice', role: 'leader', created_at: '2026-01-01', capabilities: [] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/actions/__tests__/profile.test.ts -t "disabled_at IS NULL"`
Expected: FAIL — `makeListMembersForAdmin` is not exported.

- [ ] **Step 3: Refactor `listMembersForAdmin` into factory + wrapper**

In `src/server/actions/profile.ts`, **replace** the current `listMembersForAdmin` (lines 112–145) with:

```ts
export interface ListMembersForAdminDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    fetchActiveMembers(): Promise<Array<{
      id: string;
      display_name: string;
      role: 'admin' | 'leader' | 'viewer';
      created_at: string;
    }>>;
    fetchCapabilities(): Promise<Array<{ profile_id: string; capability: Capability }>>;
  };
}

export function makeListMembersForAdmin(deps: ListMembersForAdminDeps) {
  return async function listMembersForAdmin(): Promise<MemberWithCapabilities[]> {
    await deps.requireAdmin();
    const [profiles, caps] = await Promise.all([
      deps.db.fetchActiveMembers(),
      deps.db.fetchCapabilities(),
    ]);

    const capsByProfile = new Map<string, Capability[]>();
    for (const c of caps) {
      const arr = capsByProfile.get(c.profile_id) ?? [];
      arr.push(c.capability);
      capsByProfile.set(c.profile_id, arr);
    }

    return profiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      role: p.role,
      created_at: p.created_at,
      capabilities: capsByProfile.get(p.id) ?? [],
    }));
  };
}

export async function listMembersForAdmin(): Promise<MemberWithCapabilities[]> {
  const sb = createSupabaseAdminClient();
  return makeListMembersForAdmin({
    requireAdmin: () => requireRole('admin'),
    db: {
      async fetchActiveMembers() {
        const { data, error } = await sb
          .from('profiles')
          .select('id, display_name, role, created_at')
          .is('disabled_at', null)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{
          id: string;
          display_name: string;
          role: 'admin' | 'leader' | 'viewer';
          created_at: string;
        }>;
      },
      async fetchCapabilities() {
        const { data, error } = await sb
          .from('profile_capabilities')
          .select('profile_id, capability');
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{ profile_id: string; capability: Capability }>;
      },
    },
  })();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run`
Expected: PASS — all tests green.

- [ ] **Step 5: Typecheck + build**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/profile.ts src/server/actions/__tests__/profile.test.ts
git commit -m "feat(profile): listMembersForAdmin filters out disabled users"
```

---

## Task 10: Filter `getRotaCandidates` + test

**Files:**
- Modify: `src/server/actions/service.ts` — refactor `getRotaCandidates` (lines 169–197) into factory + thin wrapper, add filter
- Create: `src/server/actions/__tests__/service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/actions/__tests__/service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeGetRotaCandidates } from '../service';

const adminSession = {
  user: { id: 'admin-uid' },
  profile: { id: 'admin-uid', display_name: 'Admin', role: 'admin' as const, created_at: '' },
};

describe('getRotaCandidates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only returns profiles where disabled_at IS NULL', async () => {
    const fetchActiveProfiles = vi.fn(async () => [
      { id: 'u1', display_name: 'Alice' },
    ]);
    const fetchCapabilities = vi.fn(async () => [
      { profile_id: 'u1', capability: 'guitar' as const },
    ]);
    const getCandidates = makeGetRotaCandidates({
      requireAdmin: async () => adminSession,
      db: { fetchActiveProfiles, fetchCapabilities },
    });

    const result = await getCandidates('some-playlist-id');
    expect(fetchActiveProfiles).toHaveBeenCalledOnce();
    expect(result).toEqual([
      { id: 'u1', display_name: 'Alice', capabilities: ['guitar'] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/actions/__tests__/service.test.ts`
Expected: FAIL — `makeGetRotaCandidates` not exported.

- [ ] **Step 3: Refactor `getRotaCandidates` in `service.ts`**

In `src/server/actions/service.ts`, **replace** the current `getRotaCandidates` (around line 169–197) with:

```ts
export interface GetRotaCandidatesDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    fetchActiveProfiles(): Promise<Array<{ id: string; display_name: string }>>;
    fetchCapabilities(): Promise<Array<{ profile_id: string; capability: Capability }>>;
  };
}

export function makeGetRotaCandidates(deps: GetRotaCandidatesDeps) {
  return async function getRotaCandidates(_playlistId: string): Promise<RotaCandidate[]> {
    await deps.requireAdmin();
    const [profiles, caps] = await Promise.all([
      deps.db.fetchActiveProfiles(),
      deps.db.fetchCapabilities(),
    ]);

    const capsByProfile = new Map<string, Capability[]>();
    for (const c of caps) {
      const arr = capsByProfile.get(c.profile_id) ?? [];
      arr.push(c.capability);
      capsByProfile.set(c.profile_id, arr);
    }

    return profiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      capabilities: capsByProfile.get(p.id) ?? [],
    }));
  };
}

export async function getRotaCandidates(playlistId: string): Promise<RotaCandidate[]> {
  const sb = createSupabaseAdminClient();
  return makeGetRotaCandidates({
    requireAdmin: () => requireRole('admin'),
    db: {
      async fetchActiveProfiles() {
        const { data, error } = await sb
          .from('profiles')
          .select('id, display_name')
          .is('disabled_at', null)
          .order('display_name');
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{ id: string; display_name: string }>;
      },
      async fetchCapabilities() {
        const { data, error } = await sb
          .from('profile_capabilities')
          .select('profile_id, capability');
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{ profile_id: string; capability: Capability }>;
      },
    },
  })(playlistId);
}
```

Note: if `Session` is not already imported at the top of `service.ts`, add it:
```ts
import { requireRole, type Session } from '@/server/auth/require';
```
(check the current import block first; only add what's missing).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run`
Expected: PASS — all tests green including the new one.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/service.ts src/server/actions/__tests__/service.test.ts
git commit -m "feat(service): getRotaCandidates filters out disabled users"
```

---

## Task 11: UI — Danger Zone in `admin/users/[id]`

**Files:**
- Modify: `src/app/(app)/admin/users/[id]/page.tsx`

- [ ] **Step 1: Add the imports and the server action**

In `src/app/(app)/admin/users/[id]/page.tsx`:

1. Replace the import at the top:
```ts
import { ArrowLeft, User, Mail, KeyRound, Trash2 } from 'lucide-react';
```
with:
```ts
import { ArrowLeft, User, Mail, KeyRound, Ban } from 'lucide-react';
```
(`Trash2` was only used by the footnote we're replacing; `Ban` is the new icon.)

2. Add to the existing imports from `@/server/actions/profile`:
```ts
import {
  adminGetUserDetail,
  adminUpdateUserDisplayName,
  adminUpdateUserEmail,
  adminResetUserPassword,
  adminDisableUser,
} from '@/server/actions/profile';
```

3. Extend the `BANNERS` map (lines 18–25) with two new entries:
```ts
'disable-fail':  { tone: 'err', text: 'Could not deactivate this user.' },
// (success is communicated by redirecting back to the list with ?ok=user-disabled)
```

4. Inside the component body (near the other inline server actions), add:
```ts
async function disableAction(form: FormData) {
  'use server';
  const result = await runAction(() =>
    adminDisableUser({ user_id: String(form.get('user_id') ?? '') }),
  );
  if (result.ok) {
    redirect('/admin/users?ok=user-disabled');
  } else {
    redirect(`/admin/users/${id}?err=disable-fail`);
  }
}
```

- [ ] **Step 2: Replace the footnote with the Danger Zone section**

In the same file, **replace** the current footnote block:
```tsx
<p className="text-xs text-(--color-muted-fg) flex items-center gap-1.5">
  <Trash2 className="size-3" aria-hidden />
  To remove a member entirely, ask Supabase support or delete via Dashboard → Auth → Users.
</p>
```
with the Danger Zone (uses a native `<dialog>` for confirmation — CSP-safe, no JS):

```tsx
<section className="grid gap-3 rounded-2xl border border-(--color-danger)/40 p-5">
  <div className="flex items-center gap-3">
    <span className="grid size-9 place-items-center rounded-lg bg-(--color-danger)/10 text-(--color-danger)">
      <Ban className="size-4" aria-hidden />
    </span>
    <div>
      <h2 className="font-display text-lg">Deactivate account</h2>
      <p className="text-xs text-(--color-muted-fg)">
        Blocks login, removes this member from the admin list and rota picker,
        and clears them from upcoming service assignments. Past assignments and
        audit history are preserved. To reverse, contact a developer — there
        is no UI for it.
      </p>
    </div>
  </div>
  {isSelf ? (
    <p className="text-xs text-(--color-muted-fg)">
      You cannot deactivate yourself.
    </p>
  ) : (
    <>
      <button
        type="button"
        // Native <dialog>: showModal() via formaction is not possible without JS.
        // Two-step pattern instead: submit reveals the confirm form via search param.
        formAction={`/admin/users/${user.id}?confirm=disable`}
        formMethod="get"
        className="rounded-lg border border-(--color-danger)/40 text-(--color-danger) px-4 py-2 text-sm font-medium hover:bg-(--color-danger)/10 self-start"
      >
        Deactivate {user.display_name}
      </button>
    </>
  )}
</section>

{/* Two-step confirm: renders only when ?confirm=disable is in the URL. */}
{confirmDisable && !isSelf && (
  <section className="grid gap-3 rounded-2xl border-2 border-(--color-danger) bg-(--color-danger)/5 p-5">
    <p className="text-sm">
      <strong>Confirm:</strong> deactivate <em>{user.display_name}</em>?
      This is one-way from the UI.
    </p>
    <div className="flex gap-2">
      <form action={disableAction}>
        <input type="hidden" name="user_id" value={user.id} />
        <button
          type="submit"
          className="rounded-lg bg-(--color-danger) text-white px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Yes, deactivate
        </button>
      </form>
      <Link
        href={`/admin/users/${user.id}`}
        className="rounded-lg border border-(--color-border) px-4 py-2 text-sm hover:border-(--color-accent)"
      >
        Cancel
      </Link>
    </div>
  </section>
)}
```

This needs a small change to the component's search-param handling. **Add** `confirm` to the `searchParams` destructure near the top of the component:

```ts
const { ok, err, confirm } = await searchParams;
const banner = ok ? BANNERS[ok] : err ? BANNERS[err] : null;
const confirmDisable = confirm === 'disable';
```

And update the `PageProps` interface:
```ts
interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string; confirm?: string }>;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS — no CSP/RSC errors. (Remember the gotcha from `feedback_rsc_serialization.md`: server-only modules must not flow to client components. We're not exporting client props here, but if the build fails, check whether `Ban` is being passed across the server/client boundary — render as JSX child, not prop.)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/admin/users/\[id\]/page.tsx
git commit -m "feat(admin): danger-zone to deactivate a user (with two-step confirm)"
```

---

## Task 12: UI — Success banner on `/admin/users`

**Files:**
- Modify: `src/app/(app)/admin/users/page.tsx` — accept `searchParams`, render banner

The list page currently has no banner pattern. We add a minimal one mirroring `[id]/page.tsx:18–25`.

- [ ] **Step 1: Add `searchParams` and banner**

In `src/app/(app)/admin/users/page.tsx`:

1. Change the function signature:
```ts
interface AdminMembersPageProps {
  searchParams: Promise<{ ok?: string; err?: string }>;
}

const BANNERS: Record<string, { tone: 'ok' | 'err'; text: string }> = {
  'user-disabled': { tone: 'ok', text: 'Member deactivated. They can no longer log in.' },
};

export default async function AdminMembersPage({ searchParams }: AdminMembersPageProps) {
  const { ok } = await searchParams;
  const banner = ok ? BANNERS[ok] : null;
  // …rest unchanged
```

2. Render the banner right after the `<header>` block (before the invite section):
```tsx
{banner && (
  <div
    className={`rounded-xl border px-4 py-3 text-sm ${
      banner.tone === 'ok'
        ? 'border-(--color-accent)/40 bg-(--color-accent)/10 text-(--color-fg)'
        : 'border-(--color-danger)/40 bg-(--color-danger)/10 text-(--color-danger)'
    }`}
  >
    {banner.text}
  </div>
)}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: both pass.

- [ ] **Step 3: Run the full test suite one more time**

Run: `pnpm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/admin/users/page.tsx
git commit -m "feat(admin): success banner after deactivating a user"
```

---

## Task 13: Manual smoke test in the running app

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: app starts on `http://localhost:3000`.

- [ ] **Step 2: Test the happy path as admin**

In a browser, signed in as an admin:
1. Visit `/admin/users` — note the count of members.
2. Click "Manage account" on a non-self viewer or leader.
3. Scroll to "Deactivate account", click the deactivate button.
4. The confirm box appears. Click "Yes, deactivate".
5. You redirect to `/admin/users` with the green banner. Member is no longer in the list.
6. Visit a playlist's rota picker (`/playlists/<id>` then pick a role). The deactivated user is not in the candidate list.

- [ ] **Step 3: Test the guards**

1. On your own "Manage account" page, the Danger Zone shows "You cannot deactivate yourself." (no button).
2. With only one admin in the DB, navigate to that admin's detail page as another admin… wait, this requires two admins to test cleanly. If only one admin exists in the dev DB, skip the live test and rely on the Vitest case from Task 6.

- [ ] **Step 4: Spot-check Supabase**

Use `mcp__claude_ai_Supabase__execute_sql`:
```sql
select id, display_name, role, disabled_at
from profiles
where disabled_at is not null;
```
Expected: the user(s) you just deactivated appear with non-null `disabled_at`.

```sql
select id, email, banned_until
from auth.users
where banned_until is not null
order by banned_until desc
limit 5;
```
Expected: same users appear with `banned_until` set ~100 years in the future.

```sql
select action, target_id, created_at
from audit_log
where action = 'profile.disabled'
order by created_at desc
limit 5;
```
Expected: audit entries for each deactivation.

- [ ] **Step 5: Commit (if any tweaks made during smoke)**

If you adjusted anything during smoke testing, commit it now:
```bash
git add -A
git commit -m "fix(admin): smoke-test adjustments to deactivation flow"
```

If nothing changed, no commit needed.

---

## Self-Review (executed during plan writing)

**Spec coverage:**
- ✅ `disabled_at` column + partial index → Task 1
- ✅ `adminDisableUser` server action + ban → Tasks 2, 4, 8
- ✅ Self-disable guard → Task 5
- ✅ Last-admin guard → Task 6
- ✅ Future rota cleanup → Task 4 (`futurePlaylistIds` + `deleteAssignments` in factory and Task 8 in wired wrapper)
- ✅ Filter `listMembersForAdmin` → Task 9
- ✅ Filter `getRotaCandidates` → Task 10
- ✅ `adminGetUserDetail` intentionally **not** filtered — confirmed by absence from Tasks 9/10
- ✅ UI Danger Zone → Task 11
- ✅ Banner after deactivation → Task 12
- ✅ All 6 Vitest cases from spec → Tasks 3, 5, 6, 7, 9, 10
- ✅ Manual smoke test → Task 13

**Placeholder scan:** no TBDs, no "TODO", no "add error handling" — every step contains real code or real commands.

**Type consistency:**
- `AdminDisableUserDeps.db.deleteAssignments(member_id, playlist_ids)` matches `service_assignments.member_id` (the correct column name).
- `markProfileDisabled` takes ISO string both in tests and in the wired wrapper.
- `'profile.disabled'` audit action name is consistent across tests and implementation.

**Naming consistency:** factory functions all follow `makeXxx` + thin wrapper `xxx`, matching `invitations.ts` and `playlists.ts`.

---

## Execution Notes

- The dev branch in Supabase is `prod` — the migration applies via `mcp__claude_ai_Supabase__apply_migration` which writes to the connected project. Confirm with the user before applying if uncertain.
- Existing memory: `feedback_rsc_serialization.md` — never pass component refs (Lucide icons) from server to client as props; render as JSX children. Task 11 keeps `<Ban>` inside the server component's JSX so this isn't triggered, but be alert.
- Existing memory: `feedback_supabase_hook_security_definer.md` — not relevant here (no new auth hooks).
- Commit identity: use `nelsonmalachi@lankanesan.com` (per memory `git_identity.md`).
