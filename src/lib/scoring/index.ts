import { createAdminClient } from '@/lib/supabase/admin'
import type { ForecastPoint, TideEvent } from '@/lib/providers/types'
import { scoreSpot, type SpotPrefs, type Window } from './scoring'

/**
 * Cache-reading loader around the pure scoring engine.
 *
 * SERVER-ONLY (via the admin client): reads the shared cache tables with the
 * service role. Keeps DB access out of scoring.ts / tide.ts, which stay pure.
 */

export interface SpotWindows {
  spotId: string
  /** The user's personal label for the spot, if set. */
  label: string | null
  /** The shared spot's catalogue name. */
  name: string
  windows: Window[]
}

/**
 * Build the qualifying windows for every spot a user follows.
 *
 * For each `user_spots` row: read that spot's cached forecast + tide, map to the
 * normalised provider shapes, and run `scoreSpot` with the row's thresholds.
 */
export async function getWindowsForUser(userId: string): Promise<SpotWindows[]> {
  const supabase = createAdminClient()

  const { data: links, error } = await supabase
    .from('user_spots')
    .select(
      `spot_id, label,
       swell_height_min_m, swell_height_max_m, swell_period_min_s,
       swell_dir_min_deg, swell_dir_max_deg, swell_dir_wraps,
       wind_dir_min_deg, wind_dir_max_deg, wind_dir_wraps, wind_speed_max_kmh,
       tide_direction, tide_height_min_norm, tide_height_max_norm,
       tide_high_offset_min_minutes, tide_high_offset_max_minutes,
       spots ( name, latitude, longitude )`,
    )
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to read user_spots: ${error.message}`)

  const results: SpotWindows[] = []

  for (const link of links ?? []) {
    const spotId = link.spot_id as string

    const [{ data: fc }, { data: tc }] = await Promise.all([
      supabase
        .from('forecast_cache')
        .select(
          'ts, swell_height_m, swell_period_s, swell_direction_deg, wind_speed_kmh, wind_direction_deg',
        )
        .eq('spot_id', spotId)
        .order('ts'),
      supabase
        .from('tide_cache')
        .select('ts, event_type, height_m')
        .eq('spot_id', spotId)
        .order('ts'),
    ])

    const forecast: ForecastPoint[] = (fc ?? []).map((r) => ({
      time: r.ts as string,
      swellHeightM: r.swell_height_m,
      swellPeriodS: r.swell_period_s,
      swellDirectionDeg: r.swell_direction_deg,
      windSpeedKmh: r.wind_speed_kmh,
      windDirectionDeg: r.wind_direction_deg,
    }))

    const tide: TideEvent[] = (tc ?? []).map((r) => ({
      time: r.ts as string,
      type: r.event_type === 'high' ? 'high' : 'low',
      heightM: r.height_m,
    }))

    const prefs: SpotPrefs = {
      swell_height_min_m: link.swell_height_min_m,
      swell_height_max_m: link.swell_height_max_m,
      swell_period_min_s: link.swell_period_min_s,
      swell_dir_min_deg: link.swell_dir_min_deg,
      swell_dir_max_deg: link.swell_dir_max_deg,
      swell_dir_wraps: link.swell_dir_wraps,
      wind_dir_min_deg: link.wind_dir_min_deg,
      wind_dir_max_deg: link.wind_dir_max_deg,
      wind_dir_wraps: link.wind_dir_wraps,
      wind_speed_max_kmh: link.wind_speed_max_kmh,
      tide_direction: link.tide_direction,
      tide_height_min_norm: link.tide_height_min_norm,
      tide_height_max_norm: link.tide_height_max_norm,
      tide_high_offset_min_minutes: link.tide_high_offset_min_minutes,
      tide_high_offset_max_minutes: link.tide_high_offset_max_minutes,
    }

    // `spots` embed is a single related row (user_spots.spot_id -> spots.id),
    // but tolerate an array shape just in case the client types it that way.
    const rel = link.spots as unknown
    const spot = (Array.isArray(rel) ? rel[0] : rel) as {
      name?: string
      latitude?: number
      longitude?: number
    } | null
    const name = spot?.name ?? ''
    const lat = spot?.latitude ?? 0
    const lng = spot?.longitude ?? 0

    results.push({
      spotId,
      label: link.label,
      name,
      windows: scoreSpot(forecast, tide, prefs, lat, lng),
    })
  }

  return results
}
