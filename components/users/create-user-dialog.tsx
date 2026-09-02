"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { UserPlus, AlertCircle } from "lucide-react"
import { createUserAction, type ActionResult } from "@/app/actions/users"
import type { Block } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"

const initial: ActionResult = { ok: false }

export function CreateUserDialog({ blocks }: { blocks: Block[] }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(createUserAction, initial)
  const router = useRouter()

  useEffect(() => {
    if (state.ok) {
      setOpen(false)
      router.refresh()
    }
  }, [state.ok, router])

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="size-4" aria-hidden="true" />
        Create User
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Create user" description="Provision a new account.">
        <form action={formAction} className="flex flex-col gap-4">
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
            <Label htmlFor="full_name">Full Name</Label>
            <Input id="full_name" name="full_name" required placeholder="Abdullah Rahman" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                required
                autoCapitalize="none"
                spellCheck={false}
                pattern="[a-z0-9._*]{3,30}"
                title="3-30 chars, lowercase a-z, 0-9, '.', '_', '*'"
                placeholder="abdullah_r"
              />
              <p className="text-xs text-muted-foreground">3-30 chars: a-z, 0-9, . _ *</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="abdullah@klgcr.com" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Temporary Password</Label>
              <Input
                id="password"
                name="password"
                type="text"
                required
                minLength={10}
                placeholder="Min. 10 characters"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="role">Role</Label>
              <Select id="role" name="role" defaultValue="maintenance_staff" required>
                <option value="admin">Administrator</option>
                <option value="maintenance_staff">Maintenance Staff</option>
                <option value="management_viewer">Management Viewer</option>
              </Select>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Default Blocks</legend>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocks available to assign.</p>
            ) : (
              <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-3">
                {blocks.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="blocks"
                      value={b.id}
                      className="size-4 rounded border-input accent-primary"
                    />
                    <span className="truncate">{b.name ?? b.code ?? `Block ${b.id}`}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create User"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
