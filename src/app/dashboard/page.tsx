import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CopyButton } from './copy-button'
import { createSpot, followSpot, signOut, unfollowSpot } from './actions'

export const dynamic = 'force-dynamic'

type Spot = {
  id: string
  name: string
  latitude: number
  longitude: number
}

type FollowedRow = {
  spot_id: string
  label: string | null
  spots: Spot | null
}

export default async function DashboardPage() {
  const supabase = await createClient()

  // getUser() revalidates against the auth server — the safe gate to use.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Run the three independent reads together.
  const [{ data: profile }, followedRes, catalogueRes] = await Promise.all([
    supabase.from('profiles').select('calendar_token').eq('id', user.id).maybeSingle(),
    // RLS already scopes user_spots to this user's links.
    supabase
      .from('user_spots')
      .select('spot_id, label, spots ( id, name, latitude, longitude )')
      .order('created_at', { ascending: true }),
    supabase.from('spots').select('id, name, latitude, longitude').order('name'),
  ])

  const followed = (followedRes.data ?? []) as unknown as FollowedRow[]
  const catalogue = (catalogueRes.data ?? []) as unknown as Spot[]

  // Spots in the shared catalogue that this user doesn't already follow.
  const followedIds = new Set(followed.map((f) => f.spot_id))
  const available = catalogue.filter((s) => !followedIds.has(s.id))

  // Build the absolute feed URL from the incoming request's host.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const feedUrl = profile?.calendar_token
    ? `${proto}://${host}/api/calendar/${profile.calendar_token}`
    : null

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            🏄 SurfCal
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as <strong>{user.email}</strong>
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-full border border-black/[.12] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
          >
            Sign out
          </button>
        </form>
      </header>

      {/* Followed spots */}
      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">Your spots</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          The breaks you follow. Each one becomes events in your calendar feed when
          conditions match.
        </p>

        {followed.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
            You&apos;re not following any spots yet. Add one below.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-black/[.06] dark:divide-white/[.08]">
            {followed.map((f) => (
              <li
                key={f.spot_id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div>
                  <p className="font-medium text-black dark:text-zinc-50">
                    {f.label ?? f.spots?.name ?? 'Unknown spot'}
                  </p>
                  {f.spots && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                      {f.spots.latitude.toFixed(4)}, {f.spots.longitude.toFixed(4)}
                    </p>
                  )}
                </div>
                <form action={unfollowSpot.bind(null, f.spot_id)}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-black/[.12] px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-white/[.2] dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add from catalogue */}
      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">
          Add from the catalogue
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Spots others have already added. Follow one to start tracking it.
        </p>

        {available.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
            Nothing new in the catalogue — create a spot below.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-black/[.06] dark:divide-white/[.08]">
            {available.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div>
                  <p className="font-medium text-black dark:text-zinc-50">{s.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                  </p>
                </div>
                <form action={followSpot.bind(null, s.id)}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-black/[.12] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
                  >
                    Follow
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Create a new spot */}
      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">
          Create a new spot
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Not in the catalogue? Add it. Tip: right-click a point in Google Maps to
          copy its latitude and longitude.
        </p>

        <form action={createSpot} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-black dark:text-zinc-50"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Harlyn Bay"
              className="mt-1 w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-black outline-none focus:border-black dark:border-white/[.2] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="latitude"
                className="block text-sm font-medium text-black dark:text-zinc-50"
              >
                Latitude
              </label>
              <input
                id="latitude"
                name="latitude"
                type="number"
                step="any"
                required
                placeholder="50.5236"
                className="mt-1 w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-black outline-none focus:border-black dark:border-white/[.2] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50"
              />
            </div>
            <div>
              <label
                htmlFor="longitude"
                className="block text-sm font-medium text-black dark:text-zinc-50"
              >
                Longitude
              </label>
              <input
                id="longitude"
                name="longitude"
                type="number"
                step="any"
                required
                placeholder="-4.9636"
                className="mt-1 w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-black outline-none focus:border-black dark:border-white/[.2] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Add spot
          </button>
        </form>
      </section>

      {/* Calendar feed */}
      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">
          Your calendar feed
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Subscribe to this URL in your calendar app. Keep it private — anyone with
          the link can see your surf windows.
        </p>

        {feedUrl ? (
          <div className="mt-4 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-black/[.04] px-3 py-2 text-sm text-zinc-800 dark:bg-white/[.06] dark:text-zinc-200">
              {feedUrl}
            </code>
            <CopyButton value={feedUrl} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            No calendar token found for your account yet.
          </p>
        )}
      </section>
    </main>
  )
}
