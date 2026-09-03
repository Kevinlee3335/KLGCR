import Image from "next/image"
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
 * KLG Campus Residence brand lockup — official transparent PNG, rendered
 * exactly as provided (no crop, stretch, redraw, or background). The wordmark
 * is horizontal and its "CAMPUS RESIDENCE" text is outlined, so it reads on
 * both dark and light surfaces. Only the display height changes per size;
 * width is automatic to preserve the original aspect ratio.
 */
const KLG_HEIGHT: Record<NonNullable<KlgLogoProps["size"]>, string> = {
  sm: "h-8",
  md: "h-12",
  lg: "h-16",
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
        className={cn("w-auto object-contain", KLG_HEIGHT[size])}
      />
      {showSystemName && (
        <span className={cn("mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]", system)}>
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
export function KeanLengMark({
  className,
  tone: _tone = "dark",
  size = "md",
}: {
  className?: string
  tone?: "light" | "dark"
  size?: "sm" | "md"
}) {
  return (
    <Image
      src="/images/kean-leng-group-logo.png"
      alt="Kean Leng Group"
      width={1024}
      height={390}
      className={cn("w-auto object-contain", size === "sm" ? "h-7" : "h-9", className)}
    />
  )
}
