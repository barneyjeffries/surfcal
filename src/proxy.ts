import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next 16 renamed the `middleware` file convention to `proxy` (middleware.ts is
// deprecated). Same job: run before routes render and refresh the auth session.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Run on every path EXCEPT:
     * - api          (the public iCal feed + cron must stay unauthenticated)
     * - _next/static, _next/image (build assets)
     * - favicon.ico and common image files
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
