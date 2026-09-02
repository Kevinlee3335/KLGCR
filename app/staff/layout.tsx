import type { ReactNode } from "react"
import { requireRole } from "@/lib/auth"
import { staffNav } from "@/lib/navigation"
import { DashboardShell } from "@/components/dashboard-shell"

export default async function StaffLayout({ children }: { children: ReactNode }) {
  // Server-side gate: only maintenance_staff may reach /staff/*.
  const { profile } = await requireRole(["maintenance_staff"])

  return (
    <DashboardShell nav={staffNav} role={profile.role} fullName={profile.full_name ?? ""}>
      {children}
    </DashboardShell>
  )
}
