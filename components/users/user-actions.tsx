"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import type { ManagedUser } from "@/lib/users-data"
import type { Block } from "@/lib/auth"
import { ROLE_LABELS, ROLE_VALUES, type AppRole } from "@/lib/navigation"
import {
  setUserEnabledAction,
  resetPasswordAction,
  updateRoleAction,
  updateUserBlocksAction,
} from "@/app/actions/users"

export function UserActions({
  user,
  blocks,
  isSelf,
}: {
  user: ManagedUser
  blocks: Block[]
  isSelf: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editOpen, setEditOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [role, setRole] = useState<AppRole>(user.role)
  const [selectedBlocks, setSelectedBlocks] = useState<number[]>(user.blockIds)
  const [newPassword, setNewPassword] = useState("")

  function toggleBlock(id: number) {
    setSelectedBlocks((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]))
  }

  function handleToggleEnabled() {
    setError(null)
    startTransition(async () => {
      // enabling when currently disabled -> pass true; disabling -> pass false
      const res = await setUserEnabledAction(user.id, !user.enabled)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleSaveRoleBlocks() {
    setError(null)
    startTransition(async () => {
      const roleRes = await updateRoleAction(user.id, role)
      if (roleRes.error) {
        setError(roleRes.error)
        return
      }
      const blocksRes = await updateUserBlocksAction(user.id, selectedBlocks)
      if (blocksRes.error) {
        setError(blocksRes.error)
        return
      }
      setEditOpen(false)
      router.refresh()
    })
  }

  function handleResetPassword() {
    setError(null)
    if (newPassword.length < 10) {
      setError("Password must be at least 10 characters.")
      return
    }
    startTransition(async () => {
      const res = await resetPasswordAction(user.id, newPassword)
      if (res.error) {
        setError(res.error)
        return
      }
      setResetOpen(false)
      setNewPassword("")
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        variant={user.enabled ? "outline" : "default"}
        size="sm"
        onClick={handleToggleEnabled}
        disabled={isPending || isSelf}
        title={isSelf ? "You cannot disable your own account" : undefined}
      >
        {user.enabled ? "Disable" : "Enable"}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} disabled={isPending}>
        Reset password
      </Button>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={isPending}>
        Role &amp; blocks
      </Button>

      {error && <span className="w-full text-right text-xs text-destructive">{error}</span>}

      {/* Edit role & blocks */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${user.fullName || user.username || "user"}`}
        description="Update the role and default blocks for this user."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`role-${user.id}`}>Role</Label>
            <Select
              id={`role-${user.id}`}
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              disabled={isSelf}
            >
              {ROLE_VALUES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            {isSelf && (
              <p className="text-xs text-muted-foreground">You cannot change your own role.</p>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Default blocks</legend>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocks available.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {blocks.map((b) => {
                  const checked = selectedBlocks.includes(b.id)
                  return (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => toggleBlock(b.id)}
                      aria-pressed={checked}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        checked
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-input hover:bg-muted"
                      }`}
                    >
                      <span
                        className={`flex size-4 items-center justify-center rounded-sm border text-[10px] ${
                          checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        }`}
                        aria-hidden="true"
                      >
                        {checked ? "✓" : ""}
                      </span>
                      <span className="truncate">{b.name ?? b.code ?? `Block ${b.id}`}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </fieldset>

          <div className="mt-1 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveRoleBlocks} disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset password */}
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset password"
        description={`Set a new password for ${user.fullName || user.username || "this user"}. Minimum 10 characters.`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`newpass-${user.id}`}>New password</Label>
            <Input
              id={`newpass-${user.id}`}
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 10 characters"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Share this temporary password with the user securely.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setResetOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleResetPassword} disabled={isPending}>
              {isPending ? "Saving…" : "Set password"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
