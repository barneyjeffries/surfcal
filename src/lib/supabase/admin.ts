import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client — BYPASSES Row Level Security.
 *
 * SERVER-ONLY. The `server-only` import above makes the build fail if this
 * module is ever imported into a Client Component.
 *
 * The service role key grants full read/write access to every user's data, so
 * it MUST NEVER reach the browser. Only use this from trusted server contexts
 * that legitimately need to bypass RLS — e.g. the cron refresh job and the
 * public iCal route handler, which looks users up by `calendar_token` because
 * calendar apps can't authenticate.
 *
 * No session is persisted: this is not an end-user client.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
