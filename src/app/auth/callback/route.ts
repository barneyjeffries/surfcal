import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/callback
 *
 * Landing point for the magic link. The free-tier default email template uses
 * `{{ .ConfirmationURL }}`, which delivers a PKCE `code` (not a token_hash) to
 * this URL. We exchange that code for a session — the server client sets the
 * auth cookies — then send the user on to their destination.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      redirect(`${origin}${next}`)
    }
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/login?error=' + encodeURIComponent('Could not sign in'))
}
