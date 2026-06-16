import { refreshAllSpots } from '@/lib/refresh'

// Always run at request time — never prerender or cache. This handler triggers
// live Stormglass fetches and writes to the cache tables.
export const dynamic = 'force-dynamic'

/**
 * Protected forecast + tide refresh endpoint.
 *
 * Vercel cron (or any trusted caller) hits this with a bearer token. Each run
 * costs ~2 Stormglass requests per spot (one weather + one tide). The free tier
 * is only 10 requests/day — DO NOT poll this endpoint; it is meant to be called
 * on the slow cron cadence (weather daily, tide weekly).
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  const authorized =
    !!expected && request.headers.get('authorization') === `Bearer ${expected}`

  if (!authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary = await refreshAllSpots()
  return Response.json(summary)
}
