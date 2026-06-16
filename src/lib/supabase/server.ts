import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client (anon key) with cookie-backed auth.
 *
 * Use in Server Components, Server Actions, and Route Handlers. Respects Row
 * Level Security — it acts as the signed-in user, never bypasses RLS. For that,
 * see `admin.ts`.
 *
 * `cookies()` is async in this version of Next.js, so this helper is async too.
 * Create a fresh client per request — never share one across requests.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // `setAll` was called from a Server Component, where setting
            // cookies is not allowed. Safe to ignore when a middleware refreshes
            // the session; otherwise surface as an auth bug.
          }
        },
      },
    },
  )
}
