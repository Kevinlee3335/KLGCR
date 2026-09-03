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
 * KLG Campus Residence brand lockup — official logo asset.
 *
 * The source asset is a square social crop with generous charcoal padding, so
 * we crop it to a horizontal wordmark band with object-cover. Its charcoal
 * background blends into dark surfaces (sidebar / hero) and reads as an
 * intentional dark plaque on light surfaces.
 */
const KLG_BOX: Record<NonNullable<KlgLogoProps["size"]>, string> = {
  sm: "h-9 w-28",
  md: "h-11 w-36",
  lg: "h-16 w-52",
}

export function KlgLogo({ className, tone = "dark", size = "md", showSystemName = true }: KlgLogoProps) {
  const system = tone === "light" ? "text-primary/85" : "text-primary"

  return (
    <div className={cn("flex flex-col", className)}>
      <div className={cn("relative overflow-hidden rounded-md", KLG_BOX[size])}>
        <Image
          src="/images/klg-campus-residence-logo.jpg"
          alt="KLG Campus Residence"
          fill
          sizes="208px"
          priority
          className="object-cover object-center"
        />
      </div>
      {showSystemName && (
        <span className={cn("mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]", system)}>
          Operations Management System
        </span>
      )}
    </div>
  )
}

/**
 * Kean Leng Group corporate lockup — official logo asset.
 * K HOTEL SDN BHD and KEAN LENG GROUP share this corporate logo. The asset has
 * a white background, so on dark surfaces we seat it on a white plaque.
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
        width={132}
        height={45}
        className="h-7 w-auto object-contain"
      />
    </div>
  )
}
