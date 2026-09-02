import { redirect } from "next/navigation"
import { getSessionContext, homePathForRole } from "@/lib/auth"

export default async function RootPage() {
  const ctx = await getSessionContext()

  if (!ctx) redirect("/login")
  if (!ctx.profile) redirect("/login?error=no_profile")

  redirect(homePathForRole(ctx.profile.role))
}
