import { createAdminClient } from '@/lib/supabase/admin'
import { getWindowsForUser } from '@/lib/scoring'

// TEMPORARY debug endpoint to eyeball scoring output. Will be removed in the
// iCal slice once /api/calendar/[token] renders the same windows as a feed.
export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/score[?userId=...]
 *
 * Protected by the same shared secret as the cron route. Resolves the target
 * user from `?userId=` or falls back to the first auth user, then returns that
 * user's scored windows per spot as JSON.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  const authorized =
    !!expected && request.headers.get('authorization') === `Bearer ${expected}`

  if (!authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  let userId = new URL(request.url).searchParams.get('userId')
  if (!userId) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    })
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    userId = data.users[0]?.id ?? null
    if (!userId) {
      return Response.json({ error: 'No users found' }, { status: 404 })
    }
  }

  const result = await getWindowsForUser(userId)
  return Response.json({ userId, spots: result })
}
