import type { ForecastPoint, TideEvent } from '@/lib/providers/types'
import { tideStateAt, type TideState } from './tide'
import { isDaylight } from './sun'
import { effectiveSwellHeight, type SpotExposure } from './transform'

/**
 * Scoring engine: cached forecast + tide + a user's thresholds -> qualifying
 * surf windows.
 *
 * Pure — no DB, no env — so it is unit-testable in isolation. The loader in
 * `index.ts` supplies the cached data.
 */

/**
 * A user's thresholds for one spot. Field names mirror the `user_spots` columns
 * so a DB row maps straight onto this shape.
 */
export interface SpotPrefs {
  swell_height_min_m: number
  swell_height_max_m: number
  swell_period_min_s: number
  swell_dir_min_deg: number | null
  swell_dir_max_deg: number | null
  swell_dir_wraps: boolean
  wind_dir_min_deg: number | null
  wind_dir_max_deg: number | null
  wind_dir_wraps: boolean
  wind_speed_max_kmh: number
  tide_direction: 'any' | 'rising' | 'falling'
  tide_height_min_norm: number
  tide_height_max_norm: number
  tide_high_offset_min_minutes: number | null
  tide_high_offset_max_minutes: number | null
}

/** A contiguous run of qualifying hours. One window -> one calendar event later. */
export interface Window {
  start: string
  end: string
  swellHeightMin: number
  swellHeightMax: number
  periodMin: number
  periodMax: number
  windSpeedMin: number
  windSpeedMax: number
  swellDirDegStart: number | null
  windDirDegStart: number | null
}

const HOUR_MS = 3_600_000

/**
 * Is `deg` inside the compass arc [min, max] (degrees the swell/wind comes FROM)?
 *
 * `min`/`max` null means no constraint -> always true. A null `deg` against a
 * real constraint fails. When `wraps` is set the arc crosses 0/360 (e.g. SW->E),
 * so the comparison flips to an OR.
 */
export function inArc(
  deg: number | null,
  min: number | null,
  max: number | null,
  wraps: boolean,
): boolean {
  if (min == null || max == null) return true
  if (deg == null) return false
  return wraps ? deg >= min || deg <= max : deg >= min && deg <= max
}

/**
 * Does this forecast hour satisfy every threshold that is set? Boolean AND — a
 * null forecast value needed by a check makes the hour fail.
 */
export function hourQualifies(
  point: ForecastPoint,
  prefs: SpotPrefs,
  tideState: TideState | null,
): boolean {
  // Swell height
  if (point.swellHeightM == null) return false
  if (
    point.swellHeightM < prefs.swell_height_min_m ||
    point.swellHeightM > prefs.swell_height_max_m
  ) {
    return false
  }

  // Swell period
  if (point.swellPeriodS == null) return false
  if (point.swellPeriodS < prefs.swell_period_min_s) return false

  // Swell direction is now modelled by the spot's exposure window in the
  // transform layer (it shapes the effective height), not gated here.

  // Wind speed
  if (point.windSpeedKmh == null) return false
  if (point.windSpeedKmh > prefs.wind_speed_max_kmh) return false

  // Wind direction arc
  if (
    !inArc(
      point.windDirectionDeg,
      prefs.wind_dir_min_deg,
      prefs.wind_dir_max_deg,
      prefs.wind_dir_wraps,
    )
  ) {
    return false
  }

  // Tide rule (relative to the cycle)
  if (tideState == null) return false
  if (prefs.tide_direction !== 'any' && tideState.direction !== prefs.tide_direction) {
    return false
  }
  if (
    tideState.normHeight < prefs.tide_height_min_norm ||
    tideState.normHeight > prefs.tide_height_max_norm
  ) {
    return false
  }
  if (
    prefs.tide_high_offset_min_minutes != null &&
    tideState.minutesToHigh < prefs.tide_high_offset_min_minutes
  ) {
    return false
  }
  if (
    prefs.tide_high_offset_max_minutes != null &&
    tideState.minutesToHigh > prefs.tide_high_offset_max_minutes
  ) {
    return false
  }

  return true
}

/** Build a Window summarising a run of qualifying points (all values non-null). */
function buildWindow(points: ForecastPoint[]): Window {
  const first = points[0]
  const last = points[points.length - 1]

  // Every point here qualified, so swell height/period and wind speed are non-null.
  const heights = points.map((p) => p.swellHeightM as number)
  const periods = points.map((p) => p.swellPeriodS as number)
  const winds = points.map((p) => p.windSpeedKmh as number)

  return {
    start: new Date(first.time).toISOString(),
    end: new Date(new Date(last.time).getTime() + HOUR_MS).toISOString(),
    swellHeightMin: Math.min(...heights),
    swellHeightMax: Math.max(...heights),
    periodMin: Math.min(...periods),
    periodMax: Math.max(...periods),
    windSpeedMin: Math.min(...winds),
    windSpeedMax: Math.max(...winds),
    swellDirDegStart: first.swellDirectionDeg,
    windDirDegStart: first.windDirectionDeg,
  }
}

/**
 * Score one spot: return the qualifying surf windows for the given forecast,
 * tide extremes, and thresholds. Consecutive qualifying hours (<= 60 min apart)
 * collapse into a single window.
 *
 * `lat`/`lng` (east-positive, so UK lng is negative) gate each hour to daylight
 * — first light through sunset — so night hours never qualify and windows end at
 * the last whole daylight hour. Daylight is computed locally (no API).
 *
 * `exposure` maps the offshore swell to an estimated height at the spot (see
 * transform.ts), so the height checks and the window's reported heights reflect
 * the break, not the open-ocean buoy.
 */
export function scoreSpot(
  forecast: ForecastPoint[],
  tide: TideEvent[],
  prefs: SpotPrefs,
  exposure: SpotExposure,
  lat: number,
  lng: number,
): Window[] {
  const sorted = [...forecast].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  )

  // Map offshore swell height to the estimated height AT the spot. Every
  // downstream check and the window's reported heights then use the spot
  // height, while swellDirectionDeg is preserved for display.
  const transformed: ForecastPoint[] = sorted.map((p) => ({
    ...p,
    swellHeightM: effectiveSwellHeight(
      {
        heightM: p.swellHeightM,
        periodS: p.swellPeriodS,
        directionDeg: p.swellDirectionDeg,
      },
      exposure,
    ),
  }))

  const windows: Window[] = []
  let run: ForecastPoint[] = []
  let lastMs = -Infinity

  const flush = () => {
    if (run.length > 0) windows.push(buildWindow(run))
    run = []
  }

  for (const point of transformed) {
    const instant = new Date(point.time)
    const tMs = instant.getTime()
    const tideState = tideStateAt(tide, instant)

    // Per-hour AND: thresholds must pass AND the hour must be in daylight.
    if (!hourQualifies(point, prefs, tideState) || !isDaylight(lat, lng, instant)) {
      flush()
      continue
    }

    if (run.length > 0 && tMs - lastMs <= 60 * 60000) {
      run.push(point)
    } else {
      flush()
      run = [point]
    }
    lastMs = tMs
  }
  flush()

  return windows
}
