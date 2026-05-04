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
