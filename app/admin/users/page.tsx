import { requireRole, getSessionContext } from "@/lib/auth"
import { listManagedUsers, listBlocks } from "@/lib/users-data"
import { ROLE_LABELS } from "@/lib/navigation"
import { PageHeader } from "@/components/dashboard-bits"
import { Badge } from "@/components/ui/badge"
import { CreateUserDialog } from "@/components/users/create-user-dialog"
import { UserActions } from "@/components/users/user-actions"

export default async function UsersPage() {
  await requireRole(["admin"])
  const ctx = await getSessionContext()
  const [users, blocks] = await Promise.all([listManagedUsers(), listBlocks()])

  const blockName = (id: number) => {
    const b = blocks.find((x) => x.id === id)
    return b?.name ?? b?.code ?? `Block ${id}`
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Create and manage accounts for administrators, maintenance staff, and viewers."
        action={<CreateUserDialog blocks={blocks} />}
      />

      {users.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">No users found yet. Create the first account.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Username</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Blocks</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{u.fullName ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.username ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="gold">{ROLE_LABELS[u.role]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.blockIds.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            u.blockIds.map((id) => (
                              <Badge key={id} variant="muted">
                                {blockName(id)}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.enabled ? "success" : "destructive"}>
                          {u.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <UserActions user={u} blocks={blocks} isSelf={u.id === ctx?.userId} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile / tablet cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {users.map((u) => (
              <div key={u.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-card-foreground">{u.fullName ?? "—"}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {u.username ?? "—"} · {u.email ?? "—"}
                    </p>
                  </div>
                  <Badge variant={u.enabled ? "success" : "destructive"}>
                    {u.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="gold">{ROLE_LABELS[u.role]}</Badge>
                  {u.blockIds.map((id) => (
                    <Badge key={id} variant="muted">
                      {blockName(id)}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <UserActions user={u} blocks={blocks} isSelf={u.id === ctx?.userId} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
