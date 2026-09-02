import "server-only"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { type AppRole, ROLE_LABELS, ROLE_VALUES } from "@/lib/navigation"

export { type AppRole, ROLE_LABELS, ROLE_VALUES }

export type Profile = {
  id: string
  email: string | null
  username: string | null
  full_name: string | null
  role: AppRole
}

export type Block = {
  id: number
  code: string | null
  name: string | null
  is_active: boolean | null
}

export type SessionContext = {
  userId: string
  email: string | null
  profile: Profile | null
}

/**
 * Resolve the authenticated user and their profile.
 *
 * The profile row is read with the service-role client keyed by the verified
 * auth user id. This bypasses RLS deliberately and safely: the id comes from
 * `auth.getUser()` (a validated session), not from client input, so a user can
 * only ever load their own profile here. This keeps role checks working even
 * if the profiles RLS policies do not grant self-select.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, username, full_name, role")
    .eq("id", user.id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: (profile as Profile | null) ?? null,
  }
}

/**
 * Enforce that the current request comes from an authenticated user whose role
 * is in `allowed`. Redirects otherwise. Returns the resolved context.
 */
export async function requireRole(allowed: AppRole[]): Promise<{ ctx: SessionContext; profile: Profile }> {
  const ctx = await getSessionContext()

  if (!ctx) redirect("/login")
  if (!ctx.profile) redirect("/login?error=no_profile")

  if (!allowed.includes(ctx.profile.role)) {
    // Send the user to their own home rather than exposing a forbidden page.
    redirect(homePathForRole(ctx.profile.role))
  }

  return { ctx, profile: ctx.profile }
}

export function homePathForRole(role: AppRole): string {
  switch (role) {
    case "admin":
      return "/admin"
    case "management_viewer":
      return "/admin"
    case "maintenance_staff":
      return "/staff"
    default:
      return "/login"
  }
}

/**
 * Load the default blocks assigned to a profile via the profile_blocks join.
 */
export async function getAssignedBlocks(profileId: string): Promise<Block[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("profile_blocks")
    .select("block_id, blocks:block_id ( id, code, name, is_active )")
    .eq("profile_id", profileId)

  if (error || !data) return []

  return data
    .map((row: any) => row.blocks)
    .filter(Boolean)
    .sort((a: Block, b: Block) => (a.name ?? "").localeCompare(b.name ?? ""))
}
