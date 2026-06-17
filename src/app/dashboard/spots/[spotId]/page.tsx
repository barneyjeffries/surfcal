import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ForecastPoint, TideEvent } from '@/lib/providers/types'
import { PreferencesForm } from './preferences-form'
import type { Prefs } from './types'

export const dynamic = 'force-dynamic'

const COLUMNS =
  'label, swell_height_min_m, swell_height_max_m, swell_period_min_s, ' +
  'swell_dir_min_deg, swell_dir_max_deg, swell_dir_wraps, ' +
  'wind_dir_min_deg, wind_dir_max_deg, wind_dir_wraps, wind_speed_max_kmh, ' +
  'tide_direction, tide_height_min_norm, tide_height_max_norm, ' +
  'tide_high_offset_min_minutes, tide_high_offset_max_minutes, ' +
  'spots ( name, timezone, latitude, longitude )'

export default async function SpotPreferencesPage({
  params,
}: {
  params: Promise<{ spotId: string }>
}) {
  const { spotId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS already restricts user_spots to this user's links; the eq() pins the spot.
  const { data } = await supabase
    .from('user_spots')
    .select(COLUMNS)
    .eq('user_id', user.id)
    .eq('spot_id', spotId)
    .maybeSingle()

  // No row → the user doesn't follow this spot (or it doesn't exist).
  if (!data) notFound()

  const row = data as unknown as Prefs & {
    spots: {
      name: string
      timezone: string
      latitude: number
      longitude: number
    } | null
  }
  const { spots, ...prefs } = row

  // This spot's cached forecast + tide. RLS (forecast_cache_select_linked /
  // tide_cache_select_linked) allows reads because the user follows this spot.
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

  return (
    <PreferencesForm
      spotId={spotId}
      spotName={spots?.name ?? 'Spot'}
      prefs={prefs}
      forecast={forecast}
      tide={tide}
      timezone={spots?.timezone ?? 'UTC'}
      lat={spots?.latitude ?? 0}
      lng={spots?.longitude ?? 0}
    />
  )
}
