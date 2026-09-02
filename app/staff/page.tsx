import { ClipboardList, Loader, PackageSearch, CheckCircle2, Building2 } from "lucide-react"
import { requireRole, getAssignedBlocks } from "@/lib/auth"
import { PageHeader, StatCard } from "@/components/dashboard-bits"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function StaffDashboardPage() {
  const { profile } = await requireRole(["maintenance_staff"])
  const blocks = await getAssignedBlocks(profile.id)

  return (
    <div>
      <PageHeader
        title={`Hi, ${profile.full_name ?? "there"}`}
        description="Your maintenance overview for today."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="To Do" value={0} icon={ClipboardList} accent />
        <StatCard label="In Progress" value={0} icon={Loader} />
        <StatCard label="Pending Material" value={0} icon={PackageSearch} />
        <StatCard label="Completed" value={0} icon={CheckCircle2} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            My Assigned Blocks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No blocks are assigned to you yet. Your administrator can assign default blocks.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {blocks.map((b) => (
                <Badge key={b.id} variant="gold" className="px-3 py-1 text-sm">
                  {b.name ?? b.code ?? `Block ${b.id}`}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
