import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "./env";

let browserClient: SupabaseClient | undefined;

/**
 * Keep the browser copy of the session in local storage. This survives an
 * iPhone Home Screen web app being closed from the app switcher; the login
 * screen then securely syncs it back to the server cookie before redirecting.
 */
export function createClient() {
  if (browserClient) return browserClient;

  const { url, key } = publicSupabaseEnv();
  browserClient = createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage: window.localStorage,
    },
  });
  return browserClient;
}
