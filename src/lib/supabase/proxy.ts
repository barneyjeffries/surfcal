import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refresh the Supabase auth session on each request.
 *
 * Server Components can't write cookies, so a rotated access token would
 * otherwise never reach the browser. This runs in the Proxy (Next 16's renamed
 * Middleware), reads the request cookies, lets supabase-js rotate the token if
 * needed, and writes the refreshed cookies onto BOTH the outgoing request (so
 * the rendered Server Components see them) and the response (so the browser
 * stores them).
 *
 * Return `supabaseResponse` unchanged — its cookies carry the refreshed
 * session. If you ever need a different response, copy these cookies onto it.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: do not run code between creating the client and getClaims().
  // getClaims() validates and, if needed, refreshes the token; a subtle bug
  // here can randomly log users out. We only refresh — gating lives in the
  // pages (dashboard / root) so the public /api/calendar feed stays untouched.
  await supabase.auth.getClaims()

  return supabaseResponse
}
