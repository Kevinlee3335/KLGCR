"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ClipboardList,
  PackagePlus,
  Eye,
  MoreHorizontal,
  CalendarClock,
  CheckCircle2,
  X,
  type LucideIcon,
} from "lucide-react"
import { SignOutButton } from "@/components/sign-out-button"
import { cn } from "@/lib/utils"

type Tab = { label: string; href: string; icon: LucideIcon }

const PRIMARY_TABS: Tab[] = [
  { label: "Dashboard", href: "/staff", icon: LayoutDashboard },
  { label: "My Tasks", href: "/staff/tasks", icon: ClipboardList },
  { label: "Request", href: "/staff/materials", icon: PackagePlus },
  { label: "Monitoring", href: "/staff/monitoring", icon: Eye },
]

const MORE_ITEMS: Tab[] = [
  { label: "Appointments", href: "/staff/appointments", icon: CalendarClock },
  { label: "Completed Jobs", href: "/staff/completed", icon: CheckCircle2 },
]

function isActive(pathname: string, href: string) {
  return href === "/staff" ? pathname === "/staff" : pathname === href || pathname.startsWith(href + "/")
}

export function StaffBottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = moreOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [moreOpen])

  const moreActive = MORE_ITEMS.some((i) => isActive(pathname, i.href))

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
        aria-label="Primary"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {PRIMARY_TABS.map((t) => {
            const active = isActive(pathname, t.href)
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <t.icon className="size-5" aria-hidden="true" />
                {t.label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              moreActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More options">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-elevated-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">More</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close menu"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {MORE_ITEMS.map((i) => {
                const active = isActive(pathname, i.href)
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm font-medium transition-colors",
                      active ? "border-primary/40 bg-primary/10 text-foreground" : "bg-background hover:bg-muted",
                    )}
                  >
                    <i.icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                    {i.label}
                  </Link>
                )
              })}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <SignOutButton className="text-foreground/80 hover:bg-muted hover:text-foreground" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
