import { StormglassProvider } from '@/lib/providers/stormglass'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GeoPoint } from '@/lib/providers/types'

/**
 * Forecast + tide refresh job.
 *
 * SERVER-ONLY: pulls from the Stormglass provider (needs STORMGLASS_API_KEY) and
 * writes the shared cache tables via the service-role admin client, which
 * bypasses RLS. Only ever call this from a trusted server context — the
 * protected cron route handler.
 *
 * Spots are a shared catalogue (see ARCHITECTURE.md), so forecast/tide is fetched
 * once per spot and serves every user linked to it.
 */

/** Number of days of weather (waves/wind) to fetch per spot. */
const FORECAST_DAYS = 7
/** Number of days of tide extremes to fetch per spot (tide is deterministic). */
const TIDE_DAYS = 10

/** One spot's outcome for the run summary. */
export interface SpotRefreshResult {
  spotId: string
  name: string
  forecastRows: number
  tideRows: number
  error?: string
}

interface SpotRow {
  id: string
  name: string
  latitude: number
  longitude: number
  forecast_latitude: number | null
  forecast_longitude: number | null
}

/**
 * Refresh the forecast and tide cache for every spot in the catalogue.
 *
 * Each spot is isolated in its own try/catch so one bad spot (e.g. a Stormglass
 * error or quota exhaustion mid-batch) doesn't abort the whole run.
 */
export async function refreshAllSpots(): Promise<SpotRefreshResult[]> {
  const supabase = createAdminClient()
  const provider = new StormglassProvider()

  const { data: spots, error } = await supabase
    .from('spots')
    .select('id, name, latitude, longitude, forecast_latitude, forecast_longitude')

  if (error) {
    throw new Error(`Failed to read spots: ${error.message}`)
  }

  const results: SpotRefreshResult[] = []

  for (const spot of (spots ?? []) as SpotRow[]) {
    // Use the offshore-nudged forecast point when present; coastal grid cells can
    // resolve to land and return nulls (see ARCHITECTURE.md).
    const point: GeoPoint =
      spot.forecast_latitude != null && spot.forecast_longitude != null
        ? { latitude: spot.forecast_latitude, longitude: spot.forecast_longitude }
        : { latitude: spot.latitude, longitude: spot.longitude }

    try {
      // --- Weather (waves/wind) ---
      const forecast = await provider.getForecast(point, FORECAST_DAYS)
      const forecastRows = forecast.map((p) => ({
        spot_id: spot.id,
        ts: p.time,
        swell_height_m: p.swellHeightM,
        swell_period_s: p.swellPeriodS,
        swell_direction_deg: p.swellDirectionDeg,
        wind_speed_kmh: p.windSpeedKmh,
        wind_direction_deg: p.windDirectionDeg,
      }))
      if (forecastRows.length > 0) {
        const { error: fErr } = await supabase
          .from('forecast_cache')
          .upsert(forecastRows, { onConflict: 'spot_id,ts' })
        if (fErr) throw new Error(`forecast upsert: ${fErr.message}`)
      }

      // --- Tide ---
      const tide = await provider.getTide(point, TIDE_DAYS)
      const tideRows = tide.map((e) => ({
        spot_id: spot.id,
        ts: e.time,
        event_type: e.type,
        height_m: e.heightM,
      }))
      if (tideRows.length > 0) {
        const { error: tErr } = await supabase
          .from('tide_cache')
          .upsert(tideRows, { onConflict: 'spot_id,ts' })
        if (tErr) throw new Error(`tide upsert: ${tErr.message}`)
      }

      results.push({
        spotId: spot.id,
        name: spot.name,
        forecastRows: forecastRows.length,
        tideRows: tideRows.length,
      })
    } catch (err) {
      results.push({
        spotId: spot.id,
        name: spot.name,
        forecastRows: 0,
        tideRows: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}
