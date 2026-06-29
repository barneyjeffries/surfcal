'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { SaveState } from './types'

/** Parse a required number field; pushes an error if missing/NaN. */
function reqNum(
  formData: FormData,
  key: string,
  label: string,
  errors: string[],
): number {
  const n = Number(String(formData.get(key) ?? '').trim())
  if (Number.isNaN(n)) errors.push(`${label} must be a number.`)
  return n
}

/** Parse an optional integer field; blank → null, NaN → error. */
function optInt(
  formData: FormData,
  key: string,
  label: string,
  errors: string[],
): number | null {
  const s = String(formData.get(key) ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  if (Number.isNaN(n)) {
    errors.push(`${label} must be a whole number or left blank.`)
    return null
  }
  return Math.trunc(n)
}

/** Parse a direction arc (or null pair when "any direction" is ticked). */
function arc(
  formData: FormData,
  prefix: string,
  label: string,
  errors: string[],
): { min: number | null; max: number | null; wraps: boolean } {
  if (formData.get(`${prefix}_any`) === 'on') {
    return { min: null, max: null, wraps: false }
  }
  const min = Number(String(formData.get(`${prefix}_min_deg`) ?? '').trim())
  const max = Number(String(formData.get(`${prefix}_max_deg`) ?? '').trim())
  const wraps = formData.get(`${prefix}_wraps`) === 'on'

  const ok = (n: number) => !Number.isNaN(n) && n >= 0 && n <= 360
  if (!ok(min) || !ok(max)) {
    errors.push(`${label} direction must be 0–360°, or tick "any direction".`)
  } else if (!wraps && min > max) {
    errors.push(
      `${label} direction min is greater than max — tick "arc crosses north" if that's intended.`,
    )
  }
  return { min, max, wraps }
}

/**
 * Update the (current user, spotId) user_spots row with new preferences.
 *
 * RLS scopes the update to the signed-in user's own link, and the explicit
 * eq() filters keep it to the one spot. Returns a SaveState for useActionState
 * so the form can show inline validation errors or a saved confirmation.
 */
export async function savePreferences(
  spotId: string,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const errors: string[] = []

  const swellHeightMin = reqNum(formData, 'swell_height_min_m', 'Swell height min', errors)
  const swellHeightMax = reqNum(formData, 'swell_height_max_m', 'Swell height max', errors)
  const swellPeriodMin = reqNum(formData, 'swell_period_min_s', 'Swell period min', errors)
  const windSpeedMax = reqNum(formData, 'wind_speed_max_kmh', 'Max wind speed', errors)
  const tideHeightMin = reqNum(formData, 'tide_height_min_norm', 'Tide height min', errors)
  const tideHeightMax = reqNum(formData, 'tide_height_max_norm', 'Tide height max', errors)

  if (swellHeightMin < 0 || swellHeightMax < 0 || swellPeriodMin < 0 || windSpeedMax < 0) {
    errors.push('Heights, period and wind speed cannot be negative.')
  }
  if (swellHeightMax < swellHeightMin) {
    errors.push('Swell height max must be ≥ min.')
  }
  if (tideHeightMin < 0 || tideHeightMin > 1 || tideHeightMax < 0 || tideHeightMax > 1) {
    errors.push('Tide heights must be between 0 (low) and 1 (high).')
  }
  if (tideHeightMax < tideHeightMin) {
    errors.push('Tide height max must be ≥ min.')
  }

  const wind = arc(formData, 'wind_dir', 'Wind', errors)

  // Spot-model fields (shared `spots` row, not per-user). The swell window
  // reuses the same arc() parser as the wind arc.
  const swellWindow = arc(formData, 'swell_window', 'Swell window', errors)
  const exposureCoeff = reqNum(formData, 'exposure_coeff', 'Exposure', errors)
  if (exposureCoeff < 0 || exposureCoeff > 1) {
    errors.push('Exposure must be between 0 and 1.')
  }

  const tideDirection = String(formData.get('tide_direction') ?? 'any')
  if (!['any', 'rising', 'falling'].includes(tideDirection)) {
    errors.push('Invalid tide direction.')
  }

  const tideOffsetMin = optInt(formData, 'tide_high_offset_min_minutes', 'Tide offset min', errors)
  const tideOffsetMax = optInt(formData, 'tide_high_offset_max_minutes', 'Tide offset max', errors)
  if (tideOffsetMin != null && tideOffsetMax != null && tideOffsetMax < tideOffsetMin) {
    errors.push('Tide offset max must be ≥ min.')
  }

  const labelRaw = String(formData.get('label') ?? '').trim()
  const label = labelRaw === '' ? null : labelRaw

  if (errors.length > 0) {
    return { status: 'error', message: errors.join(' ') }
  }

  // Personal preferences live on user_spots. Swell direction is no longer a
  // personal gate — it moved to the shared spot model below — so swell_dir_* are
  // left untouched here (they keep their existing, now-unused values).
  const { error } = await supabase
    .from('user_spots')
    .update({
      label,
      swell_height_min_m: swellHeightMin,
      swell_height_max_m: swellHeightMax,
      swell_period_min_s: swellPeriodMin,
      wind_dir_min_deg: wind.min,
      wind_dir_max_deg: wind.max,
      wind_dir_wraps: wind.wraps,
      wind_speed_max_kmh: windSpeedMax,
      tide_direction: tideDirection,
      tide_height_min_norm: tideHeightMin,
      tide_height_max_norm: tideHeightMax,
      tide_high_offset_min_minutes: tideOffsetMin,
      tide_high_offset_max_minutes: tideOffsetMax,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('spot_id', spotId)

  if (error) {
    return { status: 'error', message: error.message }
  }

  // The spot model is shared catalogue data, so it updates the `spots` row for
  // this spot (permitted by the spots_update_authenticated RLS policy). "Any
  // direction" maps to a null window — no directional shadowing.
  const { error: spotError } = await supabase
    .from('spots')
    .update({
      swell_window_min_deg: swellWindow.min,
      swell_window_max_deg: swellWindow.max,
      swell_window_wraps: swellWindow.wraps,
      exposure_coeff: exposureCoeff,
    })
    .eq('id', spotId)

  if (spotError) {
    return { status: 'error', message: spotError.message }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/spots/${spotId}`)
  return { status: 'saved' }
}

/**
 * Persist the user's display-unit preference on their profile.
 *
 * This lives on the profile (not localStorage) so the server-rendered iCal feed
 * can format heights/wind to match the dashboard toggle. Storage stays metric;
 * units only affect display.
 */
export async function setUnits(units: 'metric' | 'imperial'): Promise<void> {
  if (units !== 'metric' && units !== 'imperial') return
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('profiles').update({ units }).eq('id', user.id)
  revalidatePath('/dashboard')
}
