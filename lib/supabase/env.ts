/**
 * Resolves the Supabase URL and the client-facing key.
 *
 * The reconnected project uses Supabase's new API-key system, which exposes a
 * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (an `sb_publishable_...` key) instead
 * of the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` JWT. Both are valid anon-level
 * keys for @supabase/ssr, so we accept whichever the project provides.
 */
// NOTE: the integration-owned `NEXT_PUBLIC_SUPABASE_*` names are not injected
// into this environment (the Supabase integration is not connected here), and
// manual values for those reserved names are dropped before they reach the
// runtime. The `NEXT_PUBLIC_SB_*` custom names below are NOT reserved, so they
// propagate reliably and are used as the working fallback.
export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SB_URL || undefined
}

export function getSupabaseClientKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SB_KEY ||
    undefined
  )
}

/**
 * Cookie attributes for the Supabase auth cookie.
 *
 * The v0 preview renders the app inside a cross-origin HTTPS iframe. A cookie
 * is only sent on subsequent cross-site requests when it is written with
 * `SameSite=None; Secure` — otherwise the browser keeps it for the first
 * top-level navigation after login and then withholds it, which reads as the
 * user being logged out on the next page. `Secure` is always safe here because
 * both the preview and production are served over HTTPS.
 */
export const SUPABASE_COOKIE_OPTIONS = {
  sameSite: "none",
  secure: true,
} as const
