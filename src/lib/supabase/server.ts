import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseEnv } from "./env";
export async function createClient(){
  const store=await cookies(); const {url,key}=publicSupabaseEnv();
  return createServerClient(url,key,{cookies:{getAll:()=>store.getAll(),setAll(items){try{items.forEach(({name,value,options})=>store.set(name,value,options));}catch{/* Server Components cannot write cookies; middleware refreshes them. */}}}});
}
