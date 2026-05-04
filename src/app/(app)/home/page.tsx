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
