import Image from "next/image"
import { KlgLogo, KeanLengMark } from "@/components/klg-logo"
import { LoginForm } from "@/components/login-form"

/**
 * Replaceable hero image. Swap this file in `public/images/` (or point this
 * constant elsewhere) with a real photograph of KLG Campus Residence — the
 * layout is built to accept any landscape image.
 */
const LOGIN_BACKGROUND_IMAGE = "/images/login-building.png"

function CorporateAttribution({ tone }: { tone: "light" | "dark" }) {
  const label = tone === "light" ? "text-sidebar-foreground/70" : "text-muted-foreground"
  const strong = tone === "light" ? "text-sidebar-foreground" : "text-foreground"

  return (
    <div className="flex flex-col gap-1.5">
      <p className={cnLabel(label)}>
        Operated by
        <span className={`block text-sm font-semibold ${strong}`}>K HOTEL SDN BHD</span>
      </p>
      <p className={`mt-1 ${cnLabel(label)}`}>A member of</p>
      <KeanLengMark size="sm" className="mt-0.5" />
    </div>
  )
}

function cnLabel(color: string) {
  return `text-xs leading-relaxed ${color}`
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand / visual panel (desktop) */}
      <section className="relative hidden overflow-hidden bg-sidebar lg:block">
        <Image
          src={LOGIN_BACKGROUND_IMAGE || "/placeholder.svg"}
          alt="KLG Campus Residence"
          fill
          priority
          sizes="55vw"
          className="object-cover"
        />
        {/* Charcoal gradient for legibility */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/70 to-sidebar/20"
          aria-hidden="true"
        />
        <div className="absolute inset-0 flex flex-col justify-between p-10 xl:p-12">
          <KlgLogo tone="light" size="lg" />

          <div className="max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Campus Operations</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] text-balance text-sidebar-foreground">
              Run every block from one command centre.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/70 text-pretty">
              Complaints, maintenance jobs, materials and inventory — tracked end to end across KLG Campus Residence
              with role-based access for administrators and field staff.
            </p>
          </div>

          <CorporateAttribution tone="light" />
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          {/* Primary brand identity */}
          <KlgLogo tone="dark" size="md" showSystemName={false} className="mb-8" />

          <div className="mb-7">
            <h2 className="text-2xl font-semibold tracking-tight text-balance">Operations Management System</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
          </div>

          <LoginForm />

          <div className="mt-8 border-t border-border pt-6">
            <CorporateAttribution tone="dark" />
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Access is provisioned by your administrator. Contact them if you cannot sign in.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
