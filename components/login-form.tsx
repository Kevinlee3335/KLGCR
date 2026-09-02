"use client"

import { useActionState } from "react"
import { AlertCircle } from "lucide-react"
import { signInAction, type SignInState } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: SignInState = {}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">Username or Email</Label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@klgcr.com or your username"
          required
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <Button type="submit" size="lg" className="mt-1 h-11 w-full text-sm font-semibold" disabled={pending}>
        {pending ? "Signing in…" : "Sign In"}
      </Button>
    </form>
  )
}
