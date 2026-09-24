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
  role: z.enum(["admin", "maintenance_staff", "cleaner", "management_viewer"]),
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

const roleSchema = z.enum(["admin", "maintenance_staff", "cleaner", "management_viewer"]);

export async function updateUserRole(data: FormData) {
  const actor = await requireRole(["admin"]);
  const id = String(data.get("id") || "");
  const parsedRole = roleSchema.safeParse(data.get("role"));
  if (!id || !parsedRole.success) throw new Error("Choose a valid role.");

  const admin = adminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single();
  if (targetError) throw new Error(targetError.message);

  const { error } = await admin
    .from("profiles")
    .update({ role: parsedRole.data })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAccessAudit(admin, actor.id, id, "user_role_changed", {
    previous_role: target.role,
    role: parsedRole.data,
  });
  revalidatePath("/admin/users");
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


const passwordSchema = z.string().min(10, "Password must have at least 10 characters.");

export async function setUserPassword(data: FormData): Promise<UserActionState> {
  try {
    const actor = await requireRole(["admin"]);
    const id = String(data.get("id") || "");
    const password = passwordSchema.safeParse(data.get("password"));
    if (!id || !password.success) return { error: password.error?.issues[0]?.message || "Enter a valid password." };
    if (id === actor.id) return { error: "Use Change Password in your own account to change your password." };

    const admin = adminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { password: password.data });
    if (error) return { error: error.message };
    await recordAccessAudit(admin, actor.id, id, "password_changed_by_admin");
    revalidatePath("/admin/users");
    return { ok: "Password updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update password." };
  }
}

export async function deleteUser(data: FormData): Promise<UserActionState> {
  try {
    const actor = await requireRole(["admin"]);
    const id = String(data.get("id") || "");
    if (!id) return { error: "Choose a user to delete." };
    if (id === actor.id) return { error: "You cannot delete your own account." };

    const admin = adminClient();
    const { error: profileError } = await admin
      .from("profiles")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (profileError) return { error: profileError.message };

    const { error: authError } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (authError) return { error: authError.message };

    await recordAccessAudit(admin, actor.id, id, "user_deleted");
    revalidatePath("/admin/users");
    return { ok: "User deleted." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to delete user." };
  }
}
