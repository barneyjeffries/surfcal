import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client (anon key).
 *
 * Safe to use in Client Components — only the public URL and anon key are
 * referenced, and both are protected by Row Level Security.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
