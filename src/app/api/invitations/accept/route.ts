import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyToken } from '@/lib/invitations/token';

const querySchema = z.object({
  token: z.string().min(20).max(200),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ token: url.searchParams.get('token') });
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/sign-in?invite=invalid', req.url));
  }
  const { token } = parsed.data;

  const sb = createSupabaseAdminClient();

  // Find candidate rows by *not* token directly — bcrypt is not searchable.
  // Instead, scope by unaccepted+unexpired and verify each candidate.
  const { data: candidates, error: listError } = await sb
    .from('invitations')
    .select('id, email, role, token_hash, expires_at, accepted_at, invited_by')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString());
  if (listError) {
    return NextResponse.redirect(new URL('/sign-in?invite=error', req.url));
  }

  let invitation: typeof candidates[number] | null = null;
  for (const row of candidates ?? []) {
    if (await verifyToken(token, row.token_hash)) {
      invitation = row;
      break;
    }
  }
  if (!invitation) {
    return NextResponse.redirect(new URL('/sign-in?invite=invalid', req.url));
  }

  // Check whether an auth user already exists for the email.
  const { data: existingUserList } = await sb.auth.admin.listUsers();
  const existing = existingUserList?.users.find(
    (u) => u.email?.toLowerCase() === invitation!.email.toLowerCase(),
  );

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error: createError } = await sb.auth.admin.createUser({
      email: invitation.email,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return NextResponse.redirect(new URL('/sign-in?invite=error', req.url));
    }
    userId = created.user.id;
  }

  // Upsert the profile with the invited role.
  const { error: profileError } = await sb
    .from('profiles')
    .upsert(
      { id: userId, display_name: invitation.email.split('@')[0]!, role: invitation.role },
      { onConflict: 'id' },
    );
  if (profileError) {
    return NextResponse.redirect(new URL('/sign-in?invite=error', req.url));
  }

  // Mark invitation accepted.
  await sb
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  // Generate a magic-link sign-in. The user is redirected to /onboard after
  // the magic link's callback completes. We use Supabase Auth's generateLink
  // because it handles cookie issuance via the auth/callback handler.
  const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: invitation.email,
    options: {
      redirectTo: `${process.env.APP_ORIGIN}/api/auth/callback?next=/onboard`,
    },
  });
  if (linkError || !linkData.properties?.action_link) {
    return NextResponse.redirect(new URL('/sign-in?invite=error', req.url));
  }

  return NextResponse.redirect(linkData.properties.action_link);
}
