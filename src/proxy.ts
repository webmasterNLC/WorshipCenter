import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(req: NextRequest) {
  // 1) Origin/Host equality check on mutating methods (CSRF defense-in-depth).
  // Modern browsers always send Origin on cross-origin and same-origin POSTs.
  // Missing Origin on a state-changing method = non-browser client / suspect; reject.
  const method = req.method.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (!origin) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    try {
      const o = new URL(origin);
      if (o.host !== host) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    } catch {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  // 2) Refresh Supabase session cookies.
  const res = NextResponse.next({ request: req });
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  await sb.auth.getUser();

  // 3) Security headers.
  const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  // Realtime uses a WebSocket on the same host (wss://).
  const supabaseWs = supabaseOrigin.replace(/^https?:/, 'wss:');
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "worker-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data:",
      `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`,
      "frame-ancestors 'none'",
    ].join('; '),
  );
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.headers.set('Referrer-Policy', 'same-origin');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
