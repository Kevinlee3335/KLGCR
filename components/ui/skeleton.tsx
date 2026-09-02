import type * as React from "react"
import { cn } from "@/lib/utils"

/** Subtle pulsing placeholder for loading states. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}

export { Skeleton }
