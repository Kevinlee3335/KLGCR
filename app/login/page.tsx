import Image from "next/image"
import { KlgLogo, KeanLengMark } from "@/components/klg-logo"
import { LoginForm } from "@/components/login-form"

/**
 * Replaceable hero image. Swap this file in `public/images/` (or point this
 * constant elsewhere) with a real photograph of KLG Campus Residence — the
 * layout is built to accept any landscape image.
 */
const LOGIN_BACKGROUND_IMAGE = "/images/login-building.png"

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
          <KlgLogo tone="light" size="md" />

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

          <div className="flex flex-col gap-2.5">
            <KeanLengMark tone="light" />
            <span className="text-xs text-sidebar-foreground/60">
              Operated by K HOTEL SDN BHD — a member of Kean Leng Group
            </span>
          </div>
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="mb-8 lg:hidden">
            <KlgLogo tone="dark" size="md" />
          </div>

          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">KLG Campus Residence</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance">Operations Management System</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
          </div>

          <LoginForm />

          <div className="mt-8 border-t border-border pt-6">
            <div className="flex flex-col gap-2.5">
              <KeanLengMark tone="dark" />
              <span className="text-xs text-muted-foreground">
                Operated by K HOTEL SDN BHD — a member of Kean Leng Group
              </span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Access is provisioned by your administrator. Contact them if you cannot sign in.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
