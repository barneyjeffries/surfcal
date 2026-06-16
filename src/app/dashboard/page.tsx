import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CopyButton } from './copy-button'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  // getUser() revalidates against the auth server — the safe gate to use.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('calendar_token')
    .eq('id', user.id)
    .maybeSingle()

  // Build the absolute feed URL from the incoming request's host.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const feedUrl = profile?.calendar_token
    ? `${proto}://${host}/api/calendar/${profile.calendar_token}`
    : null

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

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

      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">
          Your calendar feed
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Subscribe to this URL in your calendar app. Keep it private — anyone
          with the link can see your surf windows.
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
