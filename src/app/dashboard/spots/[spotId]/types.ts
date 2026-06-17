/** The editable subset of a user_spots row, as loaded into the prefs form. */
export type Prefs = {
  label: string | null

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

/** Result of a save attempt, surfaced via useActionState. */
export type SaveState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; message: string }
