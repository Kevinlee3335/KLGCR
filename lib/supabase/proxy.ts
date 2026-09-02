import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseUrl, getSupabaseClientKey, SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase/env"

// Routes that never require authentication.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/error"]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseClientKey()

  // If the Supabase env vars are not yet visible to the edge runtime (they can
  // lag on the very first requests after an env change), skip session refresh
  // rather than throwing a 500. Auth is still enforced by server components via
  // requireRole() in the Node runtime, which does see the env, so this is safe.
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    // SameSite=None; Secure so the auth cookie survives the cross-origin preview iframe.
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  // Do not run code between createServerClient and supabase.auth.getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Build a redirect that preserves any auth cookies Supabase just refreshed.
  // getUser() can rotate the session (refresh tokens are single-use), writing
  // new cookies onto supabaseResponse. A bare NextResponse.redirect() would
  // drop them, invalidating the session on the next request. Copy them over.
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // Unauthenticated users hitting a protected route -> redirect to /login.
  if (!user && !isPublic(pathname)) {
    return redirectTo("/login")
  }

  // Authenticated users hitting /login -> send to the root dispatcher.
  if (user && pathname === "/login") {
    return redirectTo("/")
  }

  // IMPORTANT: return the supabaseResponse object as-is to keep cookies in sync.
  return supabaseResponse
}
