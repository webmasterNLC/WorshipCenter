# User Deactivation (Soft-Delete)

**Date:** 2026-06-23
**Status:** Design — pending approval

## Problem

`auth.users` rows cannot be hard-deleted because multiple tables reference them via foreign keys (audit log, profiles, service assignments, playlists, etc.). The admin UI currently tells admins to delete users via the Supabase Dashboard, which fails for the same reason.

We need a way to "remove" a member from the application — block their login and hide them from all UI selection points — without violating those foreign keys.

## Decisions

- **Soft-delete via `profiles.disabled_at timestamptz`.** Null = active; non-null = deactivated at that moment.
- **Login is blocked** via Supabase `auth.users.banned_until` (set through the admin API with `ban_duration: '876000h'`).
- **One-way action.** No "reactivate" button in the UI. Reversal is a developer task (set `disabled_at = null` and unban via admin API).
- **Future rota assignments are auto-cleaned.** `service_assignments` for playlists with `scheduled_for >= now()` are deleted on deactivation. Past assignments remain (historical record).
- **`disabled_at` is the source of truth for UI filtering.** `banned_until` is the security backstop for login.

## Out of Scope

- Reactivate-from-UI flow
- "Show disabled users" toggle in the members list
- Email notification to the deactivated user
- RLS test for "deactivated user with a stolen session" — `banned_until` blocks JWT refresh, sessions expire naturally

## Data Model

New migration `0026_profiles_soft_delete.sql`:

```sql
alter table profiles
  add column disabled_at timestamptz;

-- Partial index: active users are the hot path; disabled rows are rare.
create index profiles_active_idx on profiles (created_at desc)
  where disabled_at is null;
```

`auth.users` is unchanged. Existing rows automatically default to `disabled_at = NULL` (active). No backfill needed.

## Server Action

New action in `src/server/actions/profile.ts`:

```ts
export async function adminDisableUser(
  rawInput: z.input<typeof adminDisableUserInput>,
) {
  const session = await requireRole('admin');
  const parsed = adminDisableUserInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  // Guard 1: cannot disable yourself
  if (parsed.data.user_id === session.profile.id) {
    throw new ValidationError({ form: ['Cannot disable yourself.'] });
  }

  const sbAdmin = createSupabaseAdminClient();

  // Guard 2: cannot disable the last active admin (lockout protection)
  // Implementation: read target user's role; if admin, count active admins.
  // Throw ValidationError if count would drop to zero.

  // 1) Block login via Supabase ban (effectively permanent)
  await sbAdmin.auth.admin.updateUserById(parsed.data.user_id, {
    ban_duration: '876000h', // ~100 years
  });

  // 2) Mark profile as disabled
  await sbAdmin
    .from('profiles')
    .update({ disabled_at: new Date().toISOString() })
    .eq('id', parsed.data.user_id);

  // 3) Remove future service assignments
  //    Two-step (no SQL function needed):
  //    a. Select playlist IDs with scheduled_for >= now()
  //    b. Delete service_assignments where profile_id = user AND
  //       playlist_id IN (those IDs)

  // 4) Audit
  await sbAdmin.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'profile.disabled',
    p_target_type: 'profile',
    p_target_id: parsed.data.user_id,
    p_metadata: {},
  });

  revalidatePath('/admin/users');
  return { ok: true };
}
```

New schema in `src/server/actions/profile.schemas.ts`:

```ts
export const adminDisableUserInput = z.object({
  user_id: z.string().uuid(),
});
```

## UI Filtering

Three call sites must exclude disabled profiles. `adminGetUserDetail()` is intentionally *not* filtered — admins must still be able to load a deactivated user's detail page (e.g. from an audit-log link).

| File | Function | Change |
|---|---|---|
| `src/server/actions/profile.ts` | `listMembersForAdmin()` | Add `.is('disabled_at', null)` to profiles query |
| `src/server/actions/service.ts` | `getRotaCandidates()` | Add `.is('disabled_at', null)` to profiles query |
| `src/server/actions/profile.ts` | `adminGetUserDetail()` | **No change** — admin can still inspect disabled users |

## UI Changes

**Replace** the existing footnote in `src/app/(app)/admin/users/[id]/page.tsx` (currently lines 207–210, the `<Trash2>` "ask Supabase support" hint) with a Danger-Zone section:

```tsx
<section className="grid gap-3 rounded-2xl border border-(--color-danger)/40 p-5">
  <div className="flex items-center gap-3">
    <span className="grid size-9 place-items-center rounded-lg bg-(--color-danger)/10 text-(--color-danger)">
      <Ban className="size-4" aria-hidden />
    </span>
    <div>
      <h2 className="font-display text-lg">Deactivate account</h2>
      <p className="text-xs text-(--color-muted-fg)">
        Blocks login, removes the member from the admin list and rota picker,
        and clears them from upcoming service assignments. Past assignments and
        audit history are preserved. To reverse, contact a developer — there is
        no UI for it.
      </p>
    </div>
  </div>
  <form action={disableAction}>
    <input type="hidden" name="user_id" value={user.id} />
    <button
      type="submit"
      disabled={isSelf}
      className="rounded-lg border border-(--color-danger)/40 text-(--color-danger) px-4 py-2 text-sm font-medium hover:bg-(--color-danger)/10 disabled:opacity-40"
    >
      Deactivate {user.display_name}
    </button>
  </form>
</section>
```

**Confirmation step.** Strict CSP (`script-src 'self' 'unsafe-inline'`, no `unsafe-eval`) rules out custom JS modals. Use a native `<dialog>` element with a form inside — the dialog itself can be opened/closed via the HTML `dialog` API which works without external JS through `<button formmethod="dialog">` patterns. If that proves awkward in implementation, fall back to a two-step "click → reveal confirm row → click confirm" pattern, both as plain HTML forms.

**Post-action banner.** Redirect to `/admin/users?ok=user-disabled` after success. Add a `'user-disabled'` entry to the existing `BANNERS` map pattern (mirrors the pattern in `admin/users/[id]/page.tsx` lines 18–25).

## Tests

New / extended Vitest cases:

| Test | Location | Asserts |
|---|---|---|
| `adminDisableUser` happy path | `src/server/actions/__tests__/profile.test.ts` (new) | `profiles.disabled_at` set, `banned_until` set, future `service_assignments` removed, past ones preserved, audit-log row written |
| Self-disable blocked | dito | `ValidationError` with `Cannot disable yourself.` |
| Last-admin disable blocked | dito | `ValidationError`, no state change in DB |
| Non-admin caller rejected | dito | `AuthorizationError` from `requireRole` |
| `listMembersForAdmin` filters | dito | Disabled profiles absent from result |
| `getRotaCandidates` filters | `src/server/actions/__tests__/service.test.ts` (new or extend) | Disabled profiles absent from picker |

## Delivery Order

1. Migration `0026_profiles_soft_delete.sql` — column + partial index
2. Schema in `profile.schemas.ts` — `adminDisableUserInput`
3. Server action `adminDisableUser` in `profile.ts`
4. Filter additions in `listMembersForAdmin` + `getRotaCandidates`
5. UI Danger-Zone in `admin/users/[id]/page.tsx`, banner entry in `admin/users/page.tsx`
6. Vitest cases (table above)
7. `pnpm typecheck && pnpm test` green before commit

## Open Questions

None at design time. All scope and behavior decisions confirmed during brainstorming.
