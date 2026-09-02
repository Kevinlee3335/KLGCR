import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseUrl, getSupabaseClientKey, SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase/env"

export function createClient() {
  return createBrowserClient(getSupabaseUrl()!, getSupabaseClientKey()!, {
    // SameSite=None; Secure so the auth cookie survives the cross-origin preview iframe.
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
  })
}
