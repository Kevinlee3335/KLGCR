export type AppRole = "admin" | "maintenance_staff" | "management_viewer"

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  maintenance_staff: "Maintenance Staff",
  management_viewer: "Management Viewer",
}

export const ROLE_VALUES: AppRole[] = ["admin", "maintenance_staff", "management_viewer"]

// Icons are referenced by a serializable string key so nav config can safely
// cross the Server -> Client Component boundary. The key is resolved to the
// actual Lucide component inside the client nav (see dashboard-nav.tsx).
export type NavIconKey =
  | "dashboard"
  | "complaints"
  | "jobs"
  | "tasks"
  | "materials"
  | "inventory"
  | "reports"
  | "notifications"
  | "users"
  | "settings"
  | "myTasks"
  | "monitoring"
  | "appointments"
  | "completed"

export type NavItem = {
  label: string
  href: string
  icon: NavIconKey
}

export const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "New Complaints", href: "/admin/complaints", icon: "complaints" },
  { label: "Maintenance Jobs", href: "/admin/jobs", icon: "jobs" },
  { label: "Daily Tasks", href: "/admin/tasks", icon: "tasks" },
  { label: "Material Requests", href: "/admin/materials", icon: "materials" },
  { label: "Inventory", href: "/admin/inventory", icon: "inventory" },
  { label: "Reports", href: "/admin/reports", icon: "reports" },
  { label: "Notifications", href: "/admin/notifications", icon: "notifications" },
  { label: "Users", href: "/admin/users", icon: "users" },
  { label: "Settings", href: "/admin/settings", icon: "settings" },
]

export const staffNav: NavItem[] = [
  { label: "My Dashboard", href: "/staff", icon: "dashboard" },
  { label: "My Tasks", href: "/staff/tasks", icon: "myTasks" },
  { label: "Material Request", href: "/staff/materials", icon: "materials" },
  { label: "Monitoring", href: "/staff/monitoring", icon: "monitoring" },
  { label: "Appointments", href: "/staff/appointments", icon: "appointments" },
  { label: "Completed Jobs", href: "/staff/completed", icon: "completed" },
]
