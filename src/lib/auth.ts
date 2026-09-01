import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/types";

export const getSessionProfile = cache(async function getSessionProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id,username,full_name,role,is_active,profile_blocks(blocks(code,name))").eq("id",user.id).single();
  if (!data || !data.is_active) return null;
  const rows = data.profile_blocks as unknown as {blocks:{code:string;name:string}|null}[];
  return {...data, blocks: rows?.flatMap((row) => row.blocks ? [row.blocks] : [])} as Profile;
});

export async function requireRole(allowed: AppRole[]): Promise<Profile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (!allowed.includes(profile.role)) redirect(profile.role === "maintenance_staff" ? "/staff" : "/admin");
  return profile;
}
