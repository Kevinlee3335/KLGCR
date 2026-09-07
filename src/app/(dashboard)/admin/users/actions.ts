"use server";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type UserActionState = { ok?: string; error?: string };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("User administration is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function recordAccessAudit(
  admin: SupabaseClient,
  actorUserId: string,
  targetUserId: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await admin.from("user_access_audit").insert({
    actor_user_id: actorUserId,
    target_user_id: targetUserId,
    action,
    details,
  });
  if (error) throw new Error(`Access audit failed: ${error.message}`);
}

const schema = z.object({
  fullName: z.string().trim().min(2),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/),
  email: z.string().email().toLowerCase(),
  password: z.string().min(10),
  role: z.enum(["admin", "maintenance_staff", "management_viewer"]),
});

export async function createUser(
  _: UserActionState,
  data: FormData,
): Promise<UserActionState> {
  const actor = await requireRole(["admin"]);
  const parsed = schema.safeParse({
    fullName: data.get("fullName"),
    username: data.get("username"),
    email: data.get("email"),
    password: data.get("password"),
    role: data.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Check the user details." };
  }

  try {
    const admin = adminClient();
    const { data: created, error } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.data.fullName,
        username: parsed.data.username,
      },
    });
    if (error) return { error: error.message };

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        username: parsed.data.username,
        role: parsed.data.role,
      })
      .eq("id", created.user.id);
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return { error: profileError.message };
    }

    const blocks = data.getAll("blocks").map(String);
    if (blocks.length) {
      const { data: blockRows } = await admin
        .from("blocks")
        .select("id,code")
        .in("code", blocks);
      await admin.from("profile_blocks").insert(
        (blockRows || []).map((block) => ({
          profile_id: created.user.id,
          block_id: block.id,
        })),
      );
    }

    await recordAccessAudit(admin, actor.id, created.user.id, "user_created", {
      role: parsed.data.role,
      blocks,
    });
    revalidatePath("/admin/users");
    return { ok: `${parsed.data.fullName} can now sign in.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create user." };
  }
}

export async function setUserActive(data: FormData) {
  const actor = await requireRole(["admin"]);
  const id = String(data.get("id"));
  const active = data.get("active") === "true";
  const admin = adminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .update({ is_active: active })
    .eq("id", id);
  if (profileError) throw new Error(profileError.message);
  const { error: authError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : "876000h",
  });
  if (authError) throw new Error(authError.message);
  await recordAccessAudit(admin, actor.id, id, active ? "user_enabled" : "user_disabled");
  revalidatePath("/admin/users");
}

export async function sendReset(data: FormData) {
  const actor = await requireRole(["admin"]);
  const email = String(data.get("email"));
  const admin = adminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();
  if (targetError) throw new Error(targetError.message);
  const { error: resetError } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
  });
  if (resetError) throw new Error(resetError.message);
  await recordAccessAudit(admin, actor.id, target.id, "password_reset_requested");
}

const updateSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(2),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/),
  email: z.string().email().toLowerCase(),
  role: z.enum(["admin", "maintenance_staff", "management_viewer"]),
});

export async function updateUser(data: FormData) {
  const actor = await requireRole(["admin"]);
  const parsed = updateSchema.safeParse({ id:data.get("id"), fullName:data.get("fullName"), username:data.get("username"), email:data.get("email"), role:data.get("role") });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Check the user details.");
  const admin=adminClient();const blocks=data.getAll("blocks").map(String);
  const {data:before,error:beforeError}=await admin.from("profiles").select("full_name,username,email,role").eq("id",parsed.data.id).single();
  if(beforeError)throw new Error(beforeError.message);
  const{error:authError}=await admin.auth.admin.updateUserById(parsed.data.id,{email:parsed.data.email,user_metadata:{full_name:parsed.data.fullName,username:parsed.data.username}});
  if(authError)throw new Error(authError.message);
  const{error:profileError}=await admin.from("profiles").update({full_name:parsed.data.fullName,username:parsed.data.username,email:parsed.data.email,role:parsed.data.role}).eq("id",parsed.data.id);
  if(profileError)throw new Error(profileError.message);
  const blockResult=blocks.length?await admin.from("blocks").select("id,code").in("code",blocks):{data:[],error:null};
  const{data:blockRows,error:blockError}=blockResult;if(blockError)throw new Error(blockError.message);
  const{error:deleteError}=await admin.from("profile_blocks").delete().eq("profile_id",parsed.data.id);if(deleteError)throw new Error(deleteError.message);
  if(blockRows?.length){const{error:insertError}=await admin.from("profile_blocks").insert(blockRows.map(block=>({profile_id:parsed.data.id,block_id:block.id})));if(insertError)throw new Error(insertError.message)}
  await recordAccessAudit(admin,actor.id,parsed.data.id,"user_updated",{before,after:{...parsed.data,blocks}});revalidatePath("/admin/users");
}
