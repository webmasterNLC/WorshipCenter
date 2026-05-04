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
