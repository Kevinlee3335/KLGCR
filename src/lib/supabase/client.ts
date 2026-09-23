import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "./env";
import { authCookieOptions } from "./session";
export function createClient(){ const {url,key}=publicSupabaseEnv(); return createBrowserClient(url,key,{cookieOptions:authCookieOptions}); }
