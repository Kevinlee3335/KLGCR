import type * as React from "react"
import { cn } from "@/lib/utils"

type BadgeProps = React.ComponentProps<"span"> & {
  variant?: "default" | "gold" | "muted" | "success" | "destructive"
}

const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "border-border bg-secondary text-secondary-foreground",
  gold: "border-primary/30 bg-primary/15 text-primary-foreground/90",
  muted: "border-border bg-muted text-muted-foreground",
  success: "border-emerald-600/20 bg-emerald-600/10 text-emerald-700",
  destructive: "border-destructive/20 bg-destructive/10 text-destructive",
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
