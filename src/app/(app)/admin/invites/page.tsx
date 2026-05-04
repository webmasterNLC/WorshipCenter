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
