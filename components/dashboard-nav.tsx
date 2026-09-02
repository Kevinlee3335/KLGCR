"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  FileWarning,
  Wrench,
  ListChecks,
  PackagePlus,
  Boxes,
  BarChart3,
  Bell,
  Users,
  Settings,
  ClipboardList,
  Eye,
  CalendarClock,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react"
import type { NavIconKey, NavItem } from "@/lib/navigation"
import { cn } from "@/lib/utils"

// Resolve serializable icon keys to Lucide components on the client, where
// passing component functions around is allowed.
const ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  complaints: FileWarning,
  jobs: Wrench,
  tasks: ListChecks,
  materials: PackagePlus,
  inventory: Boxes,
  reports: BarChart3,
  notifications: Bell,
  users: Users,
  settings: Settings,
  myTasks: ClipboardList,
  monitoring: Eye,
  appointments: CalendarClock,
  completed: CheckCircle2,
}

export function DashboardNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/admin" && item.href !== "/staff" && pathname.startsWith(item.href))
        const Icon = ICONS[item.icon]
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", active ? "text-primary" : "text-sidebar-foreground/50")}
              aria-hidden="true"
            />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
