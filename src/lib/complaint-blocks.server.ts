import { createClient } from "@/lib/supabase/server";

export async function loadComplaintBlocks() {
  const db = await createClient();
  const { data, error } = await db.from("blocks").select("id,code").eq("is_active", true).order("code");
  return error ? null : data;
}
