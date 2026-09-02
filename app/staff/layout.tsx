import type { ReactNode } from "react"
import { requireRole } from "@/lib/auth"
import { StaffShell } from "@/components/staff-shell"

export default async function StaffLayout({ children }: { children: ReactNode }) {
  // Server-side gate: only maintenance_staff may reach /staff/*.
  const { profile } = await requireRole(["maintenance_staff"])

  return <StaffShell fullName={profile.full_name ?? ""}>{children}</StaffShell>
}
