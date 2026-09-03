import Image from "next/image"
import { KlgLogo, KeanLengMark } from "@/components/klg-logo"
import { LoginForm } from "@/components/login-form"

/**
 * Replaceable hero image. Swap this file in `public/images/` (or point this
 * constant elsewhere) with a real photograph of KLG Campus Residence — the
 * layout is built to accept any landscape image.
 */
const LOGIN_BACKGROUND_IMAGE = "/images/login-building.png"

/**
 * Single corporate ownership block, shown only at the bottom of the right
 * login panel. KLG Campus Residence is the primary brand; Kean Leng Group is
 * secondary. Horizontal on desktop, stacked on narrow screens.
 */
function CorporateFooter() {
  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs leading-relaxed text-muted-foreground">Operated by</p>
          <p className="text-sm font-semibold text-foreground">K HOTEL SDN BHD</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs leading-relaxed text-muted-foreground">A member of</p>
          <KeanLengMark size="footer" />
        </div>
      </div>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Access is provisioned by your administrator. Contact them if you cannot sign in.
      </p>
    </div>
  )
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
          {/* Brand block — medium logo + system subtitle, upper-left */}
          <KlgLogo tone="light" size="hero" />

          {/* Main hero message — the strongest element on the left */}
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

          {/* Spacer keeps the hero message vertically weighted toward the centre. */}
          <div aria-hidden="true" />
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          {/* Primary brand identity — left-aligned with the form */}
          <KlgLogo tone="dark" size="panel" showSystemName={false} className="mb-6" />

          <div className="mb-7">
            <h2 className="text-2xl font-semibold tracking-tight text-balance">Operations Management System</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
          </div>

          <LoginForm />

          <CorporateFooter />
        </div>
      </section>
    </main>
  )
}
