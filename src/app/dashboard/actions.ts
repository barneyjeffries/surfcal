'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * All mutations go through the authenticated server client, so RLS enforces
 * that a user can only touch their own user_spots links. We still fetch the
 * user id explicitly because user_spots.user_id is part of the primary key and
 * must be supplied on insert (and to scope the delete).
 */
async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}

/** Follow an existing catalogue spot: create the link with default prefs. */
export async function followSpot(spotId: string) {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from('user_spots')
    .insert({ user_id: user.id, spot_id: spotId })
  if (error) throw new Error(`Couldn't follow spot: ${error.message}`)
  revalidatePath('/dashboard')
}

/**
 * Unfollow: delete only the (user, spot) link. The shared spot row is left
 * intact — end users have no delete policy on `spots` anyway.
 */
export async function unfollowSpot(spotId: string) {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from('user_spots')
    .delete()
    .eq('user_id', user.id)
    .eq('spot_id', spotId)
  if (error) throw new Error(`Couldn't remove spot: ${error.message}`)
  revalidatePath('/dashboard')
}

/**
 * Create a brand-new shared spot, then follow it. forecast_* default to the
 * same coordinates; they can be nudged offshore later if the marine grid cell
 * resolves to land.
 */
export async function createSpot(formData: FormData) {
  const { supabase, user } = await requireUser()

  // Spot creation is admin-only. RLS enforces this too; this is a friendlier
  // guard so a non-admin gets a clear error rather than an RLS failure.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_admin) throw new Error('Only an admin can create spots.')

  const name = String(formData.get('name') ?? '').trim()
  const latitude = Number(formData.get('latitude'))
  const longitude = Number(formData.get('longitude'))

  if (!name || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new Error('Name, latitude and longitude are all required.')
  }

  const { data: spot, error: spotError } = await supabase
    .from('spots')
    .insert({
      name,
      latitude,
      longitude,
      forecast_latitude: latitude,
      forecast_longitude: longitude,
    })
    .select('id')
    .single()
  if (spotError) throw new Error(`Couldn't create spot: ${spotError.message}`)

  const { error: linkError } = await supabase
    .from('user_spots')
    .insert({ user_id: user.id, spot_id: spot.id })
  if (linkError) throw new Error(`Couldn't follow new spot: ${linkError.message}`)

  revalidatePath('/dashboard')
}

/** Sign out and return to the login page. */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
