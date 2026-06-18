import { createAdminClient } from '@/lib/supabase/admin'
import { getWindowsForUser } from '@/lib/scoring'
import { buildCalendar, formatUtcStamp, type CalEvent } from '@/lib/ical'
import {
  formatHeightRange,
  formatWindRange,
  type Unit,
} from '@/app/dashboard/spots/[spotId]/units'

export const dynamic = 'force-dynamic'

const round0 = (n: number) => Math.round(n)
// Window start-directions can be null (no swell/wind-dir constraint set).
const dir = (n: number | null) => (n == null ? '?' : String(round0(n)))

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
          `${round0(w.periodMin)}–${round0(w.periodMax)}s`,
        description:
          `Wind ${formatWindRange(w.windSpeedMin, w.windSpeedMax, unit)}. ` +
          `Swell from ${dir(w.swellDirDegStart)}°, wind from ${dir(w.windDirDegStart)}°.`,
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
