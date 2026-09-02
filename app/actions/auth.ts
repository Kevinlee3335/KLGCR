"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { homePathForRole, type AppRole } from "@/lib/auth"

export type SignInState = { error?: string }

const GENERIC_INVALID = "Invalid username/email or password."

function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false
  const until = new Date(bannedUntil).getTime()
  return Number.isFinite(until) && until > Date.now()
}

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get("identifier") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!identifier || !password) {
    return { error: "Please enter your username/email and password." }
  }

  const admin = createAdminClient()

  // Resolve the identifier to a profile (by email or username). Usernames are
  // stored lowercase, so match case-insensitively.
  const looksLikeEmail = identifier.includes("@")
  const query = admin.from("profiles").select("id, email, role")

  const { data: profileRow } = looksLikeEmail
    ? await query.ilike("email", identifier).maybeSingle()
    : await query.eq("username", identifier.toLowerCase()).maybeSingle()

  if (!profileRow || !profileRow.email) {
    // Generic response to avoid account enumeration.
    return { error: GENERIC_INVALID }
  }

  // Disabled-account check (native Supabase ban), server-side before auth.
  const { data: userLookup } = await admin.auth.admin.getUserById(profileRow.id)

  if (isBanned(userLookup?.user?.banned_until as string | null | undefined)) {
    return { error: "This account has been disabled. Please contact an administrator." }
  }

  // Authenticate against the resolved email so cookies are set on the response.
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: profileRow.email,
    password,
  })

  if (error) {
    const code = (error as { code?: string }).code
    // Surface actionable errors per Supabase auth guidance; keep credential
    // errors generic to avoid account enumeration.
    if (code === "email_not_confirmed") {
      return { error: "This account's email is not confirmed yet. Ask an administrator to confirm it before signing in." }
    }
    if (code === "too_many_requests" || (error as { status?: number }).status === 429) {
      return { error: "Too many attempts. Please wait a moment and try again." }
    }
    return { error: GENERIC_INVALID }
  }

  redirect(homePathForRole(profileRow.role as AppRole))
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
