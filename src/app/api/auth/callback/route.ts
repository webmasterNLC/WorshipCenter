import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  // Only allow same-origin relative paths — guard against open redirect.
  const nextParam = url.searchParams.get('next') ?? '/home';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/home';

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=no_code', req.url));
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=exchange', req.url));
  }
  return NextResponse.redirect(new URL(next, req.url));
}
