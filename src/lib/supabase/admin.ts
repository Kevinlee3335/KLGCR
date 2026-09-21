import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "./env";

/** Server-only client for secure, token-based resident feedback actions. */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  const { url } = publicSupabaseEnv();
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
