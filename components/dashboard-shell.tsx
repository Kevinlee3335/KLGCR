import type { ReactNode } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"
import type { NavItem } from "@/lib/navigation"
import type { AppRole } from "@/lib/auth"
import { ROLE_LABELS } from "@/lib/auth"
import { DashboardNav } from "@/components/dashboard-nav"
import { MobileNav } from "@/components/mobile-nav"
import { SignOutButton } from "@/components/sign-out-button"
import { KlgLogo } from "@/components/klg-logo"

type DashboardShellProps = {
  nav: NavItem[]
  role: AppRole
  fullName: string
  children: ReactNode
  notificationsHref?: string
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U"
  )
}

export function DashboardShell({ nav, role, fullName, children, notificationsHref }: DashboardShellProps) {
  const displayName = fullName || "User"

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <KlgLogo tone="light" size="sm" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <DashboardNav items={nav} />
        </div>
        {/* User + role + logout */}
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 flex items-center gap-3 rounded-lg px-2 py-2">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-xs font-semibold text-primary"
              aria-hidden="true"
            >
              {initials(displayName)}
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">{displayName}</span>
              <span className="truncate text-xs text-sidebar-foreground/60">{ROLE_LABELS[role]}</span>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-sm sm:px-6">
          <MobileNav items={nav} />
          <div className="lg:hidden">
            <KlgLogo tone="dark" size="sm" showSystemName={false} />
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            <Link
              href={notificationsHref ?? "#"}
              className="relative inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="size-4" aria-hidden="true" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" aria-hidden="true" />
            </Link>
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-xs font-semibold text-foreground lg:hidden"
              aria-hidden="true"
            >
              {initials(displayName)}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
