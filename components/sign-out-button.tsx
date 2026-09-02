"use client"

import { LogOut } from "lucide-react"
import { signOutAction } from "@/app/actions/auth"
import { cn } from "@/lib/utils"

export function SignOutButton({ className, label = "Sign Out" }: { className?: string; label?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
          className,
        )}
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </button>
    </form>
  )
}
