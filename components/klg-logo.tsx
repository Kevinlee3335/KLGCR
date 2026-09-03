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
 * KLG Campus Residence brand lockup — official logo asset, rendered exactly as
 * provided (no crop, stretch, or redraw). The source has a charcoal
 * background, so it blends into dark surfaces and reads as an intentional dark
 * plaque on light surfaces. Only the display height changes per size.
 */
const KLG_HEIGHT: Record<NonNullable<KlgLogoProps["size"]>, string> = {
  sm: "h-10",
  md: "h-14",
  lg: "h-20",
}

export function KlgLogo({ className, tone = "dark", size = "md", showSystemName = true }: KlgLogoProps) {
  const system = tone === "light" ? "text-primary/85" : "text-primary"

  return (
    <div className={cn("flex flex-col", className)}>
      <Image
        src="/images/klg-campus-residence-logo.jpg"
        alt="KLG Campus Residence"
        width={512}
        height={512}
        priority
        className={cn("w-auto rounded-md object-contain", KLG_HEIGHT[size])}
      />
      {showSystemName && (
        <span className={cn("mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]", system)}>
          Operations Management System
        </span>
      )}
    </div>
  )
}

/**
 * Kean Leng Group corporate lockup — official logo asset, rendered exactly as
 * provided (no crop, stretch, or redraw). The asset has a white background, so
 * on dark surfaces we seat it on a white plaque.
 */
export function KeanLengMark({ className, tone = "dark" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <div
      className={cn(
        "inline-flex w-fit items-center justify-center self-start overflow-hidden rounded-md",
        tone === "light" ? "bg-white/95 px-2.5 py-1.5 shadow-sm" : "",
        className,
      )}
    >
      <Image
        src="/images/kean-leng-group-logo.jpg"
        alt="Kean Leng Group"
        width={588}
        height={200}
        className="h-8 w-auto object-contain"
      />
    </div>
  )
}
