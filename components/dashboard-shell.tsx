import type { ReactNode } from "react"
import type { NavItem } from "@/lib/navigation"
import type { AppRole } from "@/lib/auth"
import { ROLE_LABELS } from "@/lib/auth"
import { DashboardNav } from "@/components/dashboard-nav"
import { MobileNav } from "@/components/mobile-nav"
import { SignOutButton } from "@/components/sign-out-button"
import { KlgLogo } from "@/components/klg-logo"
import { Badge } from "@/components/ui/badge"

type DashboardShellProps = {
  nav: NavItem[]
  role: AppRole
  fullName: string
  children: ReactNode
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

export function DashboardShell({ nav, role, fullName, children }: DashboardShellProps) {
  const displayName = fullName || "User"

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border px-4 py-5">
          <KlgLogo tone="light" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <DashboardNav items={nav} />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <SignOutButton />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
          <MobileNav items={nav} />

          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold text-card-foreground">{displayName}</span>
              <Badge variant="gold" className="mt-0.5">
                {ROLE_LABELS[role]}
              </Badge>
            </div>
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-xs font-semibold text-foreground"
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
