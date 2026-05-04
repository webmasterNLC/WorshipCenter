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
