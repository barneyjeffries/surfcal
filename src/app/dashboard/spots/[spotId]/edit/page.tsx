import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { SpotModel } from '../types'
import { SpotEditForm } from './spot-edit-form'

export const dynamic = 'force-dynamic'

/**
 * Admin-only editor for the shared spot-model fields (name, swell window,
 * exposure). Non-admins are bounced back to the spot's personal prefs page; the
 * spots_update_admin RLS policy is the real enforcement.
 */
export default async function SpotEditPage({
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.is_admin !== true) redirect(`/dashboard/spots/${spotId}`)

  const { data: spot } = await supabase
    .from('spots')
    .select(
      'name, swell_window_min_deg, swell_window_max_deg, swell_window_wraps, exposure_coeff',
    )
    .eq('id', spotId)
    .maybeSingle()

  if (!spot) notFound()

  const spotModel: SpotModel = {
    swell_window_min_deg: spot.swell_window_min_deg ?? null,
    swell_window_max_deg: spot.swell_window_max_deg ?? null,
    swell_window_wraps: spot.swell_window_wraps ?? false,
    exposure_coeff: spot.exposure_coeff ?? 1,
  }

  return (
    <SpotEditForm
      spotId={spotId}
      name={spot.name ?? ''}
      spotModel={spotModel}
    />
  )
}
