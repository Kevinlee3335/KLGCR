import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-card-foreground text-balance">Authentication error</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We could not complete your sign-in. The link may have expired or already been used.
        </p>
        <Button render={<Link href="/login" />} className="mt-6">
          Back to sign in
        </Button>
      </div>
    </main>
  )
}
