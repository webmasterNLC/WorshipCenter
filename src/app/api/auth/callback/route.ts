import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseOtpType, safeNext } from '@/lib/auth/callback-params';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get('next'));
  const supabase = await createSupabaseServerClient();

  // Two ways a session arrives here:
  //
  //   ?token_hash= — an admin-generated link (invitations). generateLink() has
  //     no PKCE code challenge, so GoTrue never mints a `code`; redeeming its
  //     hashed_token with verifyOtp keeps the whole exchange server-side.
  //
  //   ?code= — the PKCE flow, used by browser-initiated sign-in, password
  //     recovery, and email change.
  const tokenHash = url.searchParams.get('token_hash');
  if (tokenHash) {
    const type = parseOtpType(url.searchParams.get('type'));
    if (!type) {
      return NextResponse.redirect(new URL('/sign-in?error=bad_type', req.url));
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      return NextResponse.redirect(new URL('/sign-in?error=verify', req.url));
    }
    return NextResponse.redirect(new URL(next, req.url));
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=no_code', req.url));
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=exchange', req.url));
  }
  return NextResponse.redirect(new URL(next, req.url));
}
