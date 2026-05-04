// Browser-side Supabase client. Used by the few Client Components that
// need realtime / auth callbacks. Most reads/writes go through Server
// Actions instead — do not call this from a normal client component
// just to fetch data.
'use client';
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
