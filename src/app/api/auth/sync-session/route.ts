import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { authCookieOptions } from "@/lib/supabase/session";
import { type AppRole } from "@/lib/types";

type PendingCookie = { name: string; value: string; options: Record<string, unknown> };
type SessionPayload = { accessToken?: unknown; refreshToken?: unknown };

function response(body: object, status: number, pendingCookies: PendingCookie[]) {
  const result = NextResponse.json(body, { status });
  pendingCookies.forEach(({ name, value, options }) => result.cookies.set(name, value, options));
  return result;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({})) as SessionPayload;
  if (typeof payload.accessToken !== "string" || typeof payload.refreshToken !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid sign-in session." }, { status: 400 });
  }

  const pendingCookies: PendingCookie[] = [];
  const { url, key } = publicSupabaseEnv();
  const supabase = createServerClient(url, key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => {
        pendingCookies.push({ name, value, options: options as Record<string, unknown> });
      }),
    },
  });

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });
  const user = sessionData.user;
  if (sessionError || !user) {
    return response({ ok: false, error: "Your saved sign-in has expired. Please sign in again." }, 401, pendingCookies);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return response({ ok: false, error: "Your account profile is not configured. Contact an administrator." }, 403, pendingCookies);
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return response({ ok: false, error: "This account is disabled. Contact an administrator." }, 403, pendingCookies);
  }

  return response({ ok: true, role: profile.role as AppRole }, 200, pendingCookies);
}
