import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PreferencesForm } from './preferences-form'
import type { Prefs } from './types'

export const dynamic = 'force-dynamic'

const COLUMNS =
  'label, swell_height_min_m, swell_height_max_m, swell_period_min_s, ' +
  'swell_dir_min_deg, swell_dir_max_deg, swell_dir_wraps, ' +
  'wind_dir_min_deg, wind_dir_max_deg, wind_dir_wraps, wind_speed_max_kmh, ' +
  'tide_direction, tide_height_min_norm, tide_height_max_norm, ' +
  'tide_high_offset_min_minutes, tide_high_offset_max_minutes, ' +
  'spots ( name )'

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

  const row = data as unknown as Prefs & { spots: { name: string } | null }
  const { spots, ...prefs } = row

  return (
    <PreferencesForm
      spotId={spotId}
      spotName={spots?.name ?? 'Spot'}
      prefs={prefs}
    />
  )
}
