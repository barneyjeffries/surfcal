'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Surface ?error=... passed back by /auth/confirm on a failed link.
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error')
    if (err) setError(err)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })

    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          🏄 SurfCal
        </h1>

        {sent ? (
          <div className="mt-6 space-y-2">
            <p className="text-lg font-medium text-black dark:text-zinc-50">
              Check your email
            </p>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              We sent a magic link to <strong>{email}</strong>. Open it on this
              device to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Enter your email and we&apos;ll send you a magic link to sign in.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-black outline-none focus:border-black dark:border-white/[.2] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-foreground px-5 py-2.5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </main>
  )
}
