import { FileWarning, ListChecks, CheckCircle2, AlertTriangle, Activity, Building2 } from "lucide-react"
import { requireRole, type Block } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { PageHeader, StatCard, EmptyState } from "@/components/dashboard-bits"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

async function getAllBlocks(): Promise<Block[]> {
  const admin = createAdminClient()
  const { data } = await admin.from("blocks").select("id, code, name, is_active").order("name", { ascending: true })
  return (data as Block[] | null) ?? []
}

export default async function AdminDashboardPage() {
  const { profile } = await requireRole(["admin", "management_viewer"])
  const blocks = await getAllBlocks()

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile.full_name ?? "Administrator"}`}
        description="Operational overview for KLG Campus Residence."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="New Complaints" value={0} icon={FileWarning} accent />
        <StatCard label="Today's Tasks" value={0} icon={ListChecks} />
        <StatCard label="Completed Today" value={0} icon={CheckCircle2} />
        <StatCard label="Outstanding" value={0} icon={AlertTriangle} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Complaints, jobs, and updates will appear here once operations begin in a later phase."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" aria-hidden="true" />
              All Blocks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocks have been configured yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {blocks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"
                  >
                    <span className="text-sm font-medium">{b.name ?? b.code ?? `Block ${b.id}`}</span>
                    {b.is_active === false ? (
                      <Badge variant="muted">Inactive</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
