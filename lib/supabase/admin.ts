import "server-only"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl } from "@/lib/supabase/env"

/**
 * Service-role Supabase client. SERVER-ONLY.
 *
 * The `server-only` import guarantees a build error if this module is ever
 * imported into client code, so the service role key can never ship to the
 * browser. Use this exclusively inside server actions / route handlers for
 * privileged operations (admin user management, RLS-bypassing reads).
 */
export function createAdminClient() {
  return createClient(getSupabaseUrl()!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
