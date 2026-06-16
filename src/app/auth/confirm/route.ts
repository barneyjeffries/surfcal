import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/confirm
 *
 * Landing point for the magic link. Supabase appends `token_hash` and `type`
 * to the `emailRedirectTo` URL; we exchange them for a session (verifyOtp sets
 * the auth cookies via the server client) and send the user to their dashboard.
 * Any failure bounces back to /login with a human-readable error.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      redirect('/dashboard')
    }
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/login?error=' + encodeURIComponent('Invalid or expired link'))
}
