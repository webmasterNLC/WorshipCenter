// scripts/seed-test-users.ts
//
// Creates a realistic NLC Burgdorf band roster as test users:
//   admin × 1, leader × 1, musicians × 5
// Each gets a synthetic .test email (no real mail sent — email_confirm: true
// skips Supabase's confirmation flow), a password, a profile with role, and
// the matching capabilities for the service rota.
//
// Idempotent — re-running upserts profiles and replaces capabilities.
//
// Usage (default loads .env.local):
//   pnpm tsx scripts/seed-test-users.ts
//
// To seed the hosted Supabase project instead:
//   pnpm tsx scripts/seed-test-users.ts --hosted
//
// All test users share one password, printed at the end.

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

const envPath = process.argv.includes('--hosted')
  ? '.env.production.local'
  : '.env.local';
loadEnv({ path: envPath });

type Capability =
  | 'worship_lead' | 'vocal' | 'drums' | 'bass' | 'guitar' | 'keys'
  | 'sound' | 'camera' | 'projector';

interface TestUser {
  email: string;
  display_name: string;
  role: 'admin' | 'leader' | 'musician';
  capabilities: Capability[];
}

const PASSWORD = 'TestUser-2026-songdrop!';

const TEST_USERS: TestUser[] = [
  { email: 'maria@nlc-burgdorf.test',  display_name: 'Maria',  role: 'admin',    capabilities: ['worship_lead', 'vocal', 'keys']        },
  { email: 'lukas@nlc-burgdorf.test',  display_name: 'Lukas',  role: 'leader',   capabilities: ['worship_lead', 'vocal', 'guitar']      },
  { email: 'anna@nlc-burgdorf.test',   display_name: 'Anna',   role: 'musician', capabilities: ['vocal', 'keys']                        },
  { email: 'david@nlc-burgdorf.test',  display_name: 'David',  role: 'musician', capabilities: ['drums']                                },
  { email: 'tobias@nlc-burgdorf.test', display_name: 'Tobias', role: 'musician', capabilities: ['bass', 'guitar']                       },
  { email: 'pascal@nlc-burgdorf.test', display_name: 'Pascal', role: 'musician', capabilities: ['sound', 'camera']                      },
  { email: 'joel@nlc-burgdorf.test',   display_name: 'Joel',   role: 'musician', capabilities: ['projector', 'camera']                  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      `Supabase env missing — make sure ${envPath} contains NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`,
    );
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Seeding ${TEST_USERS.length} test users to ${url} …`);

  // Page through existing users so we know which to skip.
  const { data: existing } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingByEmail = new Map<string, string>();
  for (const u of existing.users) {
    if (u.email) existingByEmail.set(u.email.toLowerCase(), u.id);
  }

  for (const u of TEST_USERS) {
    let userId = existingByEmail.get(u.email.toLowerCase());

    if (!userId) {
      const { data, error } = await sb.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw error ?? new Error(`createUser failed for ${u.email}`);
      }
      userId = data.user.id;
      console.log(`  + ${u.email}  (${userId.slice(0, 8)}…)`);
    } else {
      console.log(`  ✓ ${u.email}  (already exists)`);
    }

    const { error: pErr } = await sb.from('profiles').upsert({
      id: userId,
      display_name: u.display_name,
      role: u.role,
    });
    if (pErr) throw new Error(`profile upsert failed for ${u.email}: ${pErr.message}`);

    // Replace capabilities atomically: delete existing, then insert wanted.
    const { error: dErr } = await sb
      .from('profile_capabilities')
      .delete()
      .eq('profile_id', userId);
    if (dErr) throw new Error(`capability clear failed for ${u.email}: ${dErr.message}`);

    if (u.capabilities.length > 0) {
      const { error: cErr } = await sb
        .from('profile_capabilities')
        .insert(u.capabilities.map((cap) => ({ profile_id: userId, capability: cap })));
      if (cErr) throw new Error(`capability insert failed for ${u.email}: ${cErr.message}`);
    }

    console.log(`      role: ${u.role.padEnd(8)}  caps: [${u.capabilities.join(', ')}]`);
  }

  console.log('\nDone.');
  console.log(`\nLogin with any of the .test emails using password:\n  ${PASSWORD}\n`);
}

main().catch((e) => {
  console.error('\nSeed failed:', e);
  process.exit(1);
});
