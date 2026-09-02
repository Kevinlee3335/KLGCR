import { cn } from "@/lib/utils"

type KlgLogoProps = {
  className?: string
  /** "light" for dark backgrounds (sidebar), "dark" for light backgrounds. */
  tone?: "light" | "dark"
  showTagline?: boolean
}

export function KlgLogo({ className, tone = "dark", showTagline = true }: KlgLogoProps) {
  const mark =
    tone === "light"
      ? "border-primary/60 text-primary"
      : "border-primary text-primary"
  const wordmark = tone === "light" ? "text-sidebar-foreground" : "text-foreground"
  const tagline = tone === "light" ? "text-sidebar-foreground/60" : "text-muted-foreground"

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md border-2 font-mono text-sm font-bold tracking-tight",
          mark,
        )}
        aria-hidden="true"
      >
        KLG
      </div>
      <div className="flex flex-col leading-none">
        <span className={cn("text-sm font-semibold tracking-wide", wordmark)}>KLG CAMPUS RESIDENCE</span>
        {showTagline && (
          <span className={cn("mt-1 text-[11px] font-medium uppercase tracking-[0.16em]", tagline)}>
            Maintenance &amp; Inventory
          </span>
        )}
      </div>
    </div>
  )
}
