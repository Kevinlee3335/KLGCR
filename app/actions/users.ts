"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionContext, type AppRole } from "@/lib/auth"

const VALID_ROLES: AppRole[] = ["admin", "maintenance_staff", "management_viewer"]
const USERNAME_RE = /^[a-z0-9._*]{3,30}$/
const MIN_PASSWORD = 10
// Far-future timestamp used to represent an indefinite Supabase ban.
const BAN_FOREVER = "876000h" // ~100 years

export type ActionResult = { ok: boolean; error?: string; message?: string }

/** Guard: every privileged action requires an admin session. */
async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const ctx = await getSessionContext()
  if (!ctx || !ctx.profile) return { error: "Not authenticated." }
  if (ctx.profile.role !== "admin") return { error: "Only administrators can perform this action." }
  return { adminId: ctx.userId }
}

function parseBlockIds(formData: FormData): number[] {
  return formData
    .getAll("blocks")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n))
}

async function setProfileBlocks(profileId: string, blockIds: number[]) {
  const admin = createAdminClient()
  // Replace the full set of assignments for this profile.
  await admin.from("profile_blocks").delete().eq("profile_id", profileId)
  if (blockIds.length > 0) {
    await admin.from("profile_blocks").insert(blockIds.map((block_id) => ({ profile_id: profileId, block_id })))
  }
}

export async function createUserAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const guard = await requireAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }

  const fullName = String(formData.get("full_name") ?? "").trim()
  const username = String(formData.get("username") ?? "").trim().toLowerCase()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const role = String(formData.get("role") ?? "") as AppRole
  const blockIds = parseBlockIds(formData)

  if (!fullName) return { ok: false, error: "Full name is required." }
  if (!USERNAME_RE.test(username))
    return {
      ok: false,
      error: "Username must be 3-30 chars, lowercase, and only a-z, 0-9, '.', '_', '*'.",
    }
  if (!email || !email.includes("@")) return { ok: false, error: "A valid email is required." }
  if (password.length < MIN_PASSWORD)
    return { ok: false, error: `Temporary password must be at least ${MIN_PASSWORD} characters.` }
  if (!VALID_ROLES.includes(role)) return { ok: false, error: "Please select a valid role." }

  const admin = createAdminClient()

  // Create the auth user with a confirmed email so they can log in immediately.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username },
  })

  if (createErr || !created?.user) {
    return { ok: false, error: createErr?.message ?? "Could not create the user." }
  }

  const userId = created.user.id

  // Upsert the profile row. If a DB trigger already created a bare row, this
  // fills in the details; otherwise it inserts the row.
  const { error: profileErr } = await admin.from("profiles").upsert(
    { id: userId, email, username, full_name: fullName, role },
    { onConflict: "id" },
  )

  if (profileErr) {
    // Roll back the auth user so we don't leave an orphaned account.
    await admin.auth.admin.deleteUser(userId)
    if (profileErr.message.toLowerCase().includes("duplicate") || profileErr.code === "23505") {
      return { ok: false, error: "That username is already taken." }
    }
    return { ok: false, error: `Could not save the profile: ${profileErr.message}` }
  }

  await setProfileBlocks(userId, blockIds)

  revalidatePath("/admin/users")
  return { ok: true, message: `User "${fullName}" created.` }
}

export async function setUserEnabledAction(userId: string, enabled: boolean): Promise<ActionResult> {
  const guard = await requireAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }
  if (userId === guard.adminId) return { ok: false, error: "You cannot disable your own account." }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: enabled ? "none" : BAN_FOREVER,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath("/admin/users")
  return { ok: true, message: enabled ? "User enabled." : "User disabled." }
}

export async function resetPasswordAction(userId: string, newPassword: string): Promise<ActionResult> {
  const guard = await requireAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }

  if (newPassword.length < MIN_PASSWORD)
    return { ok: false, error: `New password must be at least ${MIN_PASSWORD} characters.` }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })

  if (error) return { ok: false, error: error.message }
  return { ok: true, message: "Password has been reset." }
}

export async function updateRoleAction(userId: string, role: AppRole): Promise<ActionResult> {
  const guard = await requireAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }
  if (!VALID_ROLES.includes(role)) return { ok: false, error: "Invalid role." }
  if (userId === guard.adminId && role !== "admin")
    return { ok: false, error: "You cannot change your own role away from administrator." }

  const admin = createAdminClient()
  const { error } = await admin.from("profiles").update({ role }).eq("id", userId)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/admin/users")
  return { ok: true, message: "Role updated." }
}

export async function updateUserBlocksAction(userId: string, blockIds: number[]): Promise<ActionResult> {
  const guard = await requireAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }

  await setProfileBlocks(
    userId,
    blockIds.filter((n) => Number.isInteger(n)),
  )

  revalidatePath("/admin/users")
  return { ok: true, message: "Assigned blocks updated." }
}
