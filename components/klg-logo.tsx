import Image from "next/image"
import { cn } from "@/lib/utils"

type KlgLogoProps = {
  className?: string
  /** "light" for dark backgrounds (sidebar / hero), "dark" for light backgrounds. */
  tone?: "light" | "dark"
  size?: "sm" | "md" | "lg" | "hero" | "panel"
  /** Show the "Operations Management System" line beneath the wordmark. */
  showSystemName?: boolean
}

/**
 * KLG Campus Residence brand lockup — official transparent PNG, rendered
 * exactly as provided (no crop, stretch, redraw, or background). The wordmark
 * is horizontal and its "CAMPUS RESIDENCE" text is outlined, so it reads on
 * both dark and light surfaces. Width is constrained to preserve the original
 * aspect ratio; height is automatic via `object-contain`.
 *
 * Height sizes (sm/md/lg) are used in chrome (sidebar, nav). Width sizes
 * (hero/panel) hit the login page's exact brand-width targets.
 */
const KLG_SIZE: Record<NonNullable<KlgLogoProps["size"]>, string> = {
  sm: "h-8 w-auto",
  md: "h-12 w-auto",
  lg: "h-16 w-auto",
  hero: "h-auto w-[300px] xl:w-[340px]",
  panel: "h-auto w-[240px] sm:w-[260px]",
}

export function KlgLogo({ className, tone = "dark", size = "md", showSystemName = true }: KlgLogoProps) {
  const system = tone === "light" ? "text-primary/85" : "text-primary"

  return (
    <div className={cn("flex flex-col", className)}>
      <Image
        src="/images/klg-campus-residence-logo.png"
        alt="KLG Campus Residence"
        width={1086}
        height={380}
        priority
        className={cn("object-contain", KLG_SIZE[size])}
      />
      {showSystemName && (
        <span className={cn("mt-3 text-[11px] font-semibold uppercase tracking-[0.2em]", system)}>
          Operations Management System
        </span>
      )}
    </div>
  )
}

/**
 * Kean Leng Group corporate lockup — official transparent PNG, rendered exactly
 * as provided (no crop, stretch, redraw, or background). Displayed directly on
 * any surface; height controls size and width is automatic to preserve the
 * original aspect ratio. `tone` is accepted for call-site compatibility.
 */
const KEAN_LENG_SIZE: Record<"sm" | "md" | "footer", string> = {
  sm: "h-7 w-auto",
  md: "h-9 w-auto",
  footer: "h-auto w-[150px]",
}

export function KeanLengMark({
  className,
  tone: _tone = "dark",
  size = "md",
}: {
  className?: string
  tone?: "light" | "dark"
  size?: "sm" | "md" | "footer"
}) {
  return (
    <Image
      src="/images/kean-leng-group-logo.png"
      alt="Kean Leng Group"
      width={1024}
      height={390}
      className={cn("object-contain", KEAN_LENG_SIZE[size], className)}
    />
  )
}
