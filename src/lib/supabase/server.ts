import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { publicSupabaseEnv } from "./env";
import { authCookieOptions } from "./session";

export const createClient = cache(async function createClient() {
  const store = await cookies();
  const { url, key } = publicSupabaseEnv();
  return createServerClient(url, key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* Server Components cannot write cookies; middleware refreshes them. */
        }
      },
    },
  });
});

/** Server-only client for admin actions that must bypass table RLS. */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  const { url } = publicSupabaseEnv();
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
