import { KlgLogo } from "@/components/klg-logo"
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel (desktop) */}
      <section className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <KlgLogo tone="light" />
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Internal System</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight text-balance">
            Maintenance &amp; Inventory Management
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/70">
            Centralized operations for KLG Campus Residence — track work across every block with role-based access for
            administrators and maintenance staff.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          &copy; {new Date().getFullYear()} KLG Campus Residence. All rights reserved.
        </p>
      </section>

      {/* Sign-in panel */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <KlgLogo tone="dark" />
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-balance">Sign in</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              KLGCR Maintenance &amp; Inventory System
            </p>
          </div>

          <LoginForm />

          <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
            Access is provisioned by your administrator. Contact them if you cannot sign in.
          </p>
        </div>
      </section>
    </main>
  )
}
