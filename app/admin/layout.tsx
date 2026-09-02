import type { ReactNode } from "react"
import { requireRole } from "@/lib/auth"
import { adminNav } from "@/lib/navigation"
import { DashboardShell } from "@/components/dashboard-shell"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Server-side gate: only admin and management_viewer may reach /admin/*.
  // /admin/users is further restricted to admin only in its own page.
  const { profile } = await requireRole(["admin", "management_viewer"])

  return (
    <DashboardShell
      nav={adminNav}
      role={profile.role}
      fullName={profile.full_name ?? ""}
      notificationsHref="/admin/notifications"
    >
      {children}
    </DashboardShell>
  )
}
