import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import type { AppRole, Block } from "@/lib/auth"

export type ManagedUser = {
  id: string
  email: string | null
  username: string | null
  fullName: string | null
  role: AppRole
  enabled: boolean
  blockIds: number[]
}

function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false
  const until = new Date(bannedUntil).getTime()
  return Number.isFinite(until) && until > Date.now()
}

export async function listBlocks(): Promise<Block[]> {
  const admin = createAdminClient()
  const { data } = await admin.from("blocks").select("id, code, name, is_active").order("name", { ascending: true })
  return (data as Block[] | null) ?? []
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const admin = createAdminClient()

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, username, full_name, role")
    .order("full_name", { ascending: true })

  if (!profiles || profiles.length === 0) return []

  // Assigned blocks per profile.
  const { data: pb } = await admin.from("profile_blocks").select("profile_id, block_id")
  const blocksByProfile = new Map<string, number[]>()
  for (const row of pb ?? []) {
    const list = blocksByProfile.get(row.profile_id as string) ?? []
    list.push(row.block_id as number)
    blocksByProfile.set(row.profile_id as string, list)
  }

  // Enabled/disabled state comes from the auth user's ban status. Fetch the
  // auth user list once and index by id.
  const banById = new Map<string, string | null>()
  let page = 1
  // Paginate defensively in case there are many users.
  for (let i = 0; i < 20; i++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (!data || data.users.length === 0) break
    for (const u of data.users) {
      banById.set(u.id, (u as { banned_until?: string | null }).banned_until ?? null)
    }
    if (data.users.length < 200) break
    page++
  }

  return profiles.map((p) => ({
    id: p.id as string,
    email: (p.email as string | null) ?? null,
    username: (p.username as string | null) ?? null,
    fullName: (p.full_name as string | null) ?? null,
    role: p.role as AppRole,
    enabled: !isBanned(banById.get(p.id as string)),
    blockIds: blocksByProfile.get(p.id as string) ?? [],
  }))
}
