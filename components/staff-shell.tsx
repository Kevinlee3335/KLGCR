import type { ReactNode } from "react"
import { KlgLogo } from "@/components/klg-logo"
import { StaffBottomNav } from "@/components/staff-bottom-nav"

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

/**
 * Mobile-first field-service shell for maintenance staff. Renders as a centered
 * app-width column on larger screens so it always reads like a native mobile
 * application, with a persistent bottom navigation.
 */
export function StaffShell({ fullName, children }: { fullName: string; children: ReactNode }) {
  const displayName = fullName || "Staff"

  return (
    <div className="min-h-dvh bg-muted/40">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-elevated">
        {/* Top app bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-sm">
          <KlgLogo tone="dark" size="sm" showSystemName={false} />
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-xs font-semibold text-foreground"
            aria-hidden="true"
          >
            {initials(displayName)}
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 px-4 pb-24 pt-5">{children}</main>
      </div>

      <StaffBottomNav />
    </div>
  )
}
