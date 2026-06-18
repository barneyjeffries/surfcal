import { createAdminClient } from '@/lib/supabase/admin'
import { getWindowsForUser } from '@/lib/scoring'
import { buildCalendar, formatUtcStamp, type CalEvent } from '@/lib/ical'
import {
  formatHeightRange,
  formatWind,
  type Unit,
} from '@/app/dashboard/spots/[spotId]/units'

export const dynamic = 'force-dynamic'

const round0 = (n: number) => Math.round(n)

// Map a bearing in degrees to a 16-point compass label; "?" when unset
// (window start-directions can be null if no swell/wind-dir constraint is set).
const POINTS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
const compass = (deg: number | null): string =>
  deg == null ? '?' : POINTS[Math.round(deg / 22.5) % 16]

/**
 * GET /api/calendar/[token]
 *
 * Public, unauthenticated iCal feed. Calendar apps can't authenticate, so the
 * unguessable `calendar_token` IS the credential: we look the user up by it with
 * the service role (bypassing RLS), score their followed spots from the cache,
 * and emit a fresh VCALENDAR on every poll. The route only reads the cache — it
 * never calls Stormglass — so polling costs no API quota.
 *
 * Heights and wind speeds are displayed in the user's chosen units (profile
 * `units`); stored values are always metric, so this is purely a display choice.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  // Next 16: route params are async.
  const { token } = await ctx.params

  const supabase = createAdminClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, units')
    .eq('calendar_token', token)
    .maybeSingle()

  if (error) return new Response('Error', { status: 500 })
  if (!profile) return new Response('Not found', { status: 404 })

  const unit: Unit = profile.units === 'metric' ? 'metric' : 'imperial'

  const spots = await getWindowsForUser(profile.id)

  const events: CalEvent[] = []
  for (const spot of spots) {
    for (const w of spot.windows) {
      const start = new Date(w.start)
      const end = new Date(w.end)
      events.push({
        // Stable per (spot, window-start) so clients update rather than duplicate.
        uid: `${spot.spotId}-${formatUtcStamp(start)}@surfcal`,
        start,
        end,
        summary:
          `🏄 ${spot.label ?? spot.name} ` +
          `${formatHeightRange(w.swellHeightMin, w.swellHeightMax, unit)}, ` +
          `${formatWind((w.windSpeedMin + w.windSpeedMax) / 2, unit)} ` +
          `${compass(w.windDirDegStart)}`,
        description:
          `Swell ~${round0((w.periodMin + w.periodMax) / 2)}s from ${compass(w.swellDirDegStart)}. ` +
          `Wind from ${compass(w.windDirDegStart)}.`,
      })
    }
  }

  return new Response(buildCalendar('SurfCal', events), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
