import { createServerClient } from "@supabase/ssr";
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
