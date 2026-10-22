import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { gymRouteAllowed } from "@/lib/gym-patrol";
import { authCookieOptions } from "@/lib/supabase/session";

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")) {
      request.cookies.delete(cookie.name);
      response.cookies.delete(cookie.name);
    }
  }
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set("Cache-Control", "private, no-store");
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: claimsData, error } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub } : null;
  const invalidRefreshToken = error?.code === "refresh_token_not_found" || error?.message.includes("Refresh Token Not Found");
  if (invalidRefreshToken) clearSupabaseCookies(request, response);

  const protectedPath = ["/admin", "/staff", "/gym"].some(prefix=>request.nextUrl.pathname===prefix || request.nextUrl.pathname.startsWith(prefix+"/"));
  if (protectedPath && (!user || invalidRefreshToken)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", request.nextUrl.pathname);
    const redirectResponse = NextResponse.redirect(login);
    if (invalidRefreshToken) clearSupabaseCookies(request, redirectResponse);
    return redirectResponse;
  }
  if (user) {
    const {data:profile}=await supabase.from("profiles").select("role,is_active,deleted_at").eq("id",user.id).maybeSingle();
    const path=request.nextUrl.pathname;
    if(profile?.role==="gym_patrol" && profile.is_active && !profile.deleted_at && !gymRouteAllowed(path)) {
      if(path.startsWith("/api/")) return NextResponse.json({error:"Access denied."},{status:403,headers:{"Cache-Control":"private, no-store"}});
      const home=request.nextUrl.clone();home.pathname="/gym";home.search="";
      return NextResponse.redirect(home);
    }
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
