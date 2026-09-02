import { cn } from "@/lib/utils"

type KlgLogoProps = {
  className?: string
  /** "light" for dark backgrounds (sidebar / hero), "dark" for light backgrounds. */
  tone?: "light" | "dark"
  size?: "sm" | "md" | "lg"
  /** Show the "Operations Management System" line beneath the wordmark. */
  showSystemName?: boolean
}

/**
 * KLG Campus Residence brand lockup.
 *
 * NOTE: The monogram is a typographic placeholder for the official KLG Campus
 * Residence logo asset. Drop the real logo into `public/images/` and swap the
 * monogram <div> for an <img> — the surrounding layout is sized to accept it.
 */
export function KlgLogo({ className, tone = "dark", size = "md", showSystemName = true }: KlgLogoProps) {
  const markSize = size === "lg" ? "size-12 text-base" : size === "sm" ? "size-9 text-xs" : "size-10 text-sm"
  const brandSize = size === "lg" ? "text-base" : size === "sm" ? "text-[13px]" : "text-sm"

  const markCls =
    tone === "light"
      ? "border-primary/50 bg-primary/10 text-primary"
      : "border-primary bg-primary/10 text-primary"
  const wordmark = tone === "light" ? "text-sidebar-foreground" : "text-foreground"
  const system = tone === "light" ? "text-primary/80" : "text-primary"

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border-2 font-mono font-bold tracking-tight",
          markSize,
          markCls,
        )}
        aria-hidden="true"
      >
        KLG
      </div>
      <div className="flex flex-col leading-none">
        <span className={cn("font-semibold tracking-wide", brandSize, wordmark)}>KLG CAMPUS RESIDENCE</span>
        {showSystemName && (
          <span className={cn("mt-1 text-[10px] font-semibold uppercase tracking-[0.18em]", system)}>
            Operations Management System
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Kean Leng Group corporate lockup — used subtly for the corporate footer.
 * Shared by K HOTEL SDN BHD and KEAN LENG GROUP. Also a typographic placeholder
 * for the corporate logo asset.
 */
export function KeanLengMark({ className, tone = "dark" }: { className?: string; tone?: "light" | "dark" }) {
  const ring = tone === "light" ? "border-sidebar-foreground/30 text-sidebar-foreground/80" : "border-border text-foreground/70"
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-bold tracking-tight",
        ring,
        className,
      )}
      aria-hidden="true"
    >
      KL
    </div>
  )
}
