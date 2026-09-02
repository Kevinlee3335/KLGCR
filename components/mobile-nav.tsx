"use client"

import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"
import type { NavItem } from "@/lib/navigation"
import { DashboardNav } from "@/components/dashboard-nav"
import { SignOutButton } from "@/components/sign-out-button"
import { KlgLogo } from "@/components/klg-logo"

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-sidebar p-4">
            <div className="mb-6 flex items-center justify-between">
              <KlgLogo tone="light" showTagline={false} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                aria-label="Close navigation menu"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DashboardNav items={items} onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-4 border-t border-sidebar-border pt-4">
              <SignOutButton />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
